const canvas = document.querySelector("#map");
const ctx = canvas.getContext("2d");
const status = document.querySelector("#status");
const notice = document.querySelector("#notice");
const pause = document.querySelector("#pause");
const reset = document.querySelector("#reset");
let api,
  snapshot,
  view,
  hover = null,
  keyboard = [3, 3],
  keyboardActive = false;
let accumulator = 0,
  previousTime = null,
  latestState = "",
  telemetryTime = 0;
const decoder = new TextDecoder();
const help =
  "Goals snap to the grid. The robot keeps a safe distance from walls.";
const errors = [
  "",
  "Choose a destination inside the map.",
  "Too close to a wall. Choose an open space.",
  "No route to that space. Your current goal is unchanged.",
];
function read() {
  const ptr = api.nav_snapshot();
  // Read memory after snapshot allocation: WebAssembly memory can grow.
  return JSON.parse(
    decoder.decode(
      new Uint8Array(api.memory.buffer, ptr, api.nav_snapshot_len()),
    ),
  );
}
function project(x, y) {
  return [view.left + x * view.scale, view.top + (8 - y) * view.scale];
}
function world(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  return [
    (clientX - box.left - view.left) / view.scale,
    8 - (clientY - box.top - view.top) / view.scale,
  ];
}
function cellAt(x, y) {
  if (x < 0 || y < 0 || x >= 12 || y >= 8) return null;
  return [Math.floor(x / 0.4), Math.floor(y / 0.4)];
}
function setGoal(x, y) {
  const result = api.nav_goal(x, y);
  snapshot = read();
  notice.textContent = result
    ? errors[result]
    : "New destination set. You can change it at any time.";
  notice.classList.toggle("error", result !== 0);
  update();
  draw();
}
function update() {
  const state = snapshot.paused ? "paused" : snapshot.state;
  if (state !== latestState) {
    status.textContent = {
      idle: "Choose a destination",
      moving: "On the move",
      arrived: "Destination reached",
      paused: "Paused",
      canceled: "Stopped",
    }[state];
    document
      .querySelector("#status-dot")
      .classList.toggle("active", state === "moving" || state === "arrived");
    latestState = state;
  }
  pause.textContent = snapshot.paused ? "Resume" : "Pause";
  pause.setAttribute("aria-pressed", String(snapshot.paused));
  pause.disabled = snapshot.state !== "moving";
  document.querySelector("#telemetry").textContent = snapshot.goal
    ? `${snapshot.path_length.toFixed(1)} m route · ${snapshot.expanded} cells explored`
    : "12 × 8 m · A* planner";
  // Observable DOM state is useful for automated acceptance tests and assistive tooling.
  canvas.dataset.state = state;
  canvas.dataset.goalId = snapshot.goal_id;
  canvas.dataset.pose = JSON.stringify(snapshot.pose);
  canvas.dataset.goal = JSON.stringify(snapshot.goal);
  canvas.dataset.ticks = snapshot.ticks;
}
function roundRect(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function draw() {
  if (!snapshot || !view) return;
  const s = view.scale,
    r = 0.4 * s;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = "#f0f2eb";
  ctx.fillRect(0, 0, view.width, view.height);
  // The grid stays square even when a short landscape viewport letterboxes the map.
  ctx.strokeStyle = "#e0e6da";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 0; x <= 30; x++) {
    const p = project(x * 0.4, 0);
    ctx.moveTo(p[0], view.top);
    ctx.lineTo(p[0], view.top + 8 * s);
  }
  for (let y = 0; y <= 20; y++) {
    const p = project(0, y * 0.4);
    ctx.moveTo(view.left, p[1]);
    ctx.lineTo(view.left + 12 * s, p[1]);
  }
  ctx.stroke();
  for (let i = 0; i < 600; i++) {
    const x = i % 30,
      y = Math.floor(i / 30),
      p = project(x * 0.4, (y + 1) * 0.4);
    if (snapshot.map.blocked[i] && !snapshot.map.occupied[i]) {
      ctx.fillStyle = "#e5e9df";
      ctx.fillRect(p[0], p[1], r, r);
    }
    if (snapshot.map.occupied[i])
      roundRect(
        p[0] + 0.5,
        p[1] + 0.5,
        r - 1,
        r - 1,
        Math.min(2, r / 8),
        "#aab6a3",
      );
  }
  if (snapshot.path.length) {
    const points = [
      snapshot.pose.slice(0, 2),
      ...snapshot.path.slice(snapshot.waypoint),
    ];
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = project(...p);
      i ? ctx.lineTo(...q) : ctx.moveTo(...q);
    });
    ctx.strokeStyle = "#27765d";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.fillStyle = "#27765d";
    for (const p of points.slice(1)) {
      const q = project(...p);
      ctx.beginPath();
      ctx.arc(...q, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const cursor = keyboardActive ? keyboard : hover;
  if (cursor) {
    const id = cursor[1] * 30 + cursor[0],
      p = project((cursor[0] + 0.5) * 0.4, (cursor[1] + 0.5) * 0.4);
    ctx.strokeStyle = snapshot.map.blocked[id] ? "#b46b42" : "#6c8c72";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(p[0] - r / 2 + 2, p[1] - r / 2 + 2, r - 4, r - 4);
    ctx.setLineDash([]);
  }
  if (snapshot.goal) {
    const p = project(...snapshot.goal);
    ctx.strokeStyle = "#b9753b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(...p, Math.max(4, 0.15 * s), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b9753b";
    ctx.beginPath();
    ctx.arc(...p, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = project(...snapshot.pose);
  ctx.save();
  ctx.translate(...p);
  ctx.rotate(-snapshot.pose[2]);
  ctx.shadowColor = "#164f3233";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#176b55";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, snapshot.radius * s), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#f4faf0";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.max(3, snapshot.radius * s * 0.7), 0);
  ctx.stroke();
  ctx.restore();
}
function resize() {
  const box = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(box.width / 12, box.height / 8);
  view = {
    width: box.width,
    height: box.height,
    scale,
    left: (box.width - 12 * scale) / 2,
    top: (box.height - 8 * scale) / 2,
  };
  document.querySelector(".map-scale span").style.width = `${scale}px`;
  draw();
}
canvas.addEventListener("click", (e) => {
  if (api) {
    keyboardActive = false;
    setGoal(...world(e.clientX, e.clientY));
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (api && e.pointerType !== "touch") {
    hover = cellAt(...world(e.clientX, e.clientY));
    keyboardActive = false;
    draw();
  }
});
canvas.addEventListener("pointerleave", () => {
  hover = null;
  draw();
});
canvas.addEventListener("keydown", (e) => {
  if (!api) return;
  const steps = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };
  if (steps[e.key]) {
    e.preventDefault();
    keyboardActive = true;
    keyboard = [
      Math.max(0, Math.min(29, keyboard[0] + steps[e.key][0])),
      Math.max(0, Math.min(19, keyboard[1] + steps[e.key][1])),
    ];
    draw();
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    keyboardActive = true;
    setGoal((keyboard[0] + 0.5) * 0.4, (keyboard[1] + 0.5) * 0.4);
  }
});
pause.addEventListener("click", () => {
  api.nav_pause(snapshot.paused ? 0 : 1);
  snapshot = read();
  accumulator = 0;
  update();
  draw();
});
reset.addEventListener("click", () => {
  api.nav_reset();
  snapshot = read();
  accumulator = 0;
  keyboard = [3, 3];
  hover = null;
  keyboardActive = false;
  notice.textContent = help;
  notice.classList.remove("error");
  update();
  draw();
});
document.addEventListener("visibilitychange", () => {
  previousTime = null;
  accumulator = 0;
});
function frame(time) {
  if (previousTime !== null && !document.hidden) {
    // Fixed 50 Hz simulation; discard excessive wall time instead of teleporting after a stall.
    accumulator += Math.min((time - previousTime) / 1000, 0.1);
    while (accumulator >= 0.02) {
      api.nav_tick();
      accumulator -= 0.02;
    }
    snapshot = read();
    draw();
    if (time - telemetryTime > 100) {
      update();
      telemetryTime = time;
    }
  }
  previousTime = time;
  requestAnimationFrame(frame);
}
try {
  const response = await fetch(new URL("./nav_core.wasm", import.meta.url));
  if (!response.ok)
    throw new Error(`Engine request failed (${response.status})`);
  const { instance } = await WebAssembly.instantiate(
    await response.arrayBuffer(),
    {},
  );
  api = instance.exports;
  api.nav_reset();
  snapshot = read();
  reset.disabled = false;
  document.querySelector("#loading").hidden = true;
  new ResizeObserver(resize).observe(canvas);
  resize();
  update();
  requestAnimationFrame(frame);
} catch (error) {
  document.querySelector("#loading").textContent =
    "The navigation engine could not load. Please refresh or try a browser with WebAssembly enabled.";
  status.textContent = "Engine unavailable";
  console.error(error);
}
