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
  return page
    .locator("#map")
    .evaluate((c) => ({
      ...c.dataset,
      pose: JSON.parse(c.dataset.pose),
      goal: JSON.parse(c.dataset.goal),
    }));
}
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("./");
  await expect(page.locator("#loading")).toBeHidden();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
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
    "does not run ROS 2 middleware",
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
