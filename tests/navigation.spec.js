import { test, expect } from "@playwright/test";
async function clickWorld(page, x, y, touch = false) {
  const b = await page.locator("#map").boundingBox();
  const s = Math.min(b.width / 12, b.height / 8);
  const px = b.x + (b.width - 12 * s) / 2 + x * s,
    py = b.y + (b.height - 8 * s) / 2 + (8 - y) * s;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}
async function state(page) {
  return page.locator("#map").evaluate((c) => ({
    ...c.dataset,
    pose: JSON.parse(c.dataset.pose),
    goal: JSON.parse(c.dataset.goal),
  }));
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-10T00:00:00Z") });
  // Freeze on the blank page, before ROS startup can make a relative deadline stale.
  await page.clock.pauseAt(new Date("2026-11-10T12:00:00Z"));
  await page.goto("./");
  await expect(page.locator("#loading")).toBeHidden();
});
test("navigation, replacement, rejection, pause, arrival and reset", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tap = info.project.use.hasTouch;
  await expect(
    page.getByRole("heading", { name: "Navigation Lab", exact: true }),
  ).toBeVisible();
  await clickWorld(page, 7, 2.6, tap);
  await page.clock.runFor(700);
  const moving = await state(page);
  expect(moving.goalId).toBe("1");
  expect(moving.pose[0]).toBeGreaterThan(1.4);
  await clickWorld(page, 2.6, 3, tap);
  await page.clock.runFor(200);
  expect((await state(page)).goalId).toBe("2");
  await clickWorld(page, 0.2, 0.2, tap);
  await expect(page.locator("#notice")).toContainText("Too close");
  expect((await state(page)).goalId).toBe("2");
  await clickWorld(page, 10.6, 6.2, tap);
  await expect(page.locator("#notice")).toContainText("No route");
  expect((await state(page)).goalId).toBe("2");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const held = await state(page);
  await page.clock.runFor(1500);
  expect((await state(page)).pose).toEqual(held.pose);
  // Replacing a goal during pause is supported and must not resume motion.
  await clickWorld(page, 2.6, 3, tap);
  await page.clock.runFor(200);
  expect((await state(page)).state).toBe("paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.runFor(12000);
  const arrived = await state(page);
  expect(arrived.state).toBe("arrived");
  expect(arrived.pose[0]).toBeCloseTo(2.6, 8);
  expect(arrived.pose[1]).toBeCloseTo(3, 8);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  const reset = await state(page);
  expect(reset.state).toBe("idle");
  expect(reset.goal).toBeNull();
  expect(reset.pose).toEqual([1.4, 1.4, 0]);
  expect(errors).toEqual([]);
});
test("responsive map, controls, learning content and screenshot", async ({
  page,
}, info) => {
  const sizes = await page.evaluate(() => ({
    width: innerWidth,
    doc: document.documentElement.scrollWidth,
    height: innerHeight,
  }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.width);
  const map = await page.locator("#map").boundingBox();
  expect(map.width).toBeGreaterThan(250);
  expect(map.height).toBeGreaterThan(110);
  // Primary controls and the complete map must be visible without scrolling on these layouts.
  const reset = await page
    .getByRole("button", { name: "Reset", exact: true })
    .boundingBox();
  expect(reset.y + reset.height).toBeLessThanOrEqual(sizes.height);
  await clickWorld(page, 7, 2.6, info.project.use.hasTouch);
  await page.clock.runFor(800);
  await page.screenshot({
    path: `test-results/${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator("summary").click();
  await expect(page.locator(".learning")).toContainText(
    "Real ROS 2 nodes run in this tab.",
  );
  expect(
    await page.getByRole("link", { name: "Source" }).getAttribute("href"),
  ).toContain("github.com/LeoMaglanoc/ros2-navigation-lab");
});
test("keyboard goals and orientation resize retain state", async ({ page }) => {
  await page.locator("#map").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.clock.runFor(2000);
  expect((await state(page)).goal).toEqual([1.8, 1.4000000000000001]);
  const before = await state(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.runFor(100);
  expect((await state(page)).goalId).toBe(before.goalId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(100);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("actual browser ROS middleware delivers typed goals and telemetry", async ({
  page,
}, info) => {
  const graph = () => page.evaluate(() => window.navigationLab.getRosGraph());
  const initial = await graph();
  expect(initial.middleware).toBe("rmw_wasm_cpp");
  expect(initial.nodes).toEqual(["browser_ui", "navigator"]);
  expect(initial.observed_map_cells).toBe(600);
  expect(initial.topics.map((t) => t.name)).toEqual([
    "/goal_pose",
    "/control",
    "/state",
    "/map",
    "/plan",
    "/odom",
    "/cmd_vel",
  ]);
  await clickWorld(page, 7, 2.6, info.project.use.hasTouch);
  await page.clock.runFor(600);
  const delivered = await graph();
  const goal = delivered.topics.find((t) => t.name === "/goal_pose");
  expect(goal.type).toBe("geometry_msgs/msg/Pose2D");
  expect(goal.published).toBe(1);
  expect(goal.received).toBe(1);
  expect(delivered.observed_path_poses).toBeGreaterThan(1);
  expect(delivered.observed_odom[0]).toBeGreaterThan(1.4);
  for (const name of ["/state", "/odom", "/cmd_vel"]) {
    const topic = delivered.topics.find((t) => t.name === name);
    expect(topic.published).toBeGreaterThan(1);
    expect(topic.received).toBe(topic.published);
  }
  await page.locator("summary").click();
  await expect(page.locator("#ros-middleware")).toHaveText("rmw_wasm_cpp");
  await expect(page.locator("#ros-topics")).toContainText("/goal_pose");
});

test("removing the real goal subscription prevents navigation", async ({
  page,
}, info) => {
  await page.goto("./?test=1");
  await expect(page.locator("#loading")).toBeHidden();
  const before = await state(page);
  await page.evaluate(() => window.navigationLab.setGoalSubscription(false));
  await clickWorld(page, 7, 2.6, info.project.use.hasTouch);
  await expect(page.locator("#notice")).toContainText(
    "ROS goal delivery is unavailable",
  );
  await page.clock.runFor(1500);
  const blocked = await state(page);
  expect(blocked.goalId).toBe("0");
  expect(blocked.pose).toEqual(before.pose);
  const graph = await page.evaluate(() => window.navigationLab.getRosGraph());
  expect(graph.goal_subscription).toBe(false);
  expect(graph.topics.find((t) => t.name === "/goal_pose")).toMatchObject({
    published: 1,
    received: 0,
  });
  await page.evaluate(() => window.navigationLab.setGoalSubscription(true));
  await clickWorld(page, 2.6, 3, info.project.use.hasTouch);
  await page.clock.runFor(600);
  expect((await state(page)).goalId).toBe("1");
  const restored = await page.evaluate(() =>
    window.navigationLab.getRosGraph(),
  );
  expect(restored.topics.find((t) => t.name === "/goal_pose")).toMatchObject({
    published: 2,
    received: 1,
  });
});
