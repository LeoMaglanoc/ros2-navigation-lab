// Instantiate the Rust algorithm and the actual ROS2WASM runtime separately.
// Only the C++ navigator's ROS handlers may mutate the Rust engine.
export async function createRuntime() {
  const response = await fetch(new URL("./nav_core.wasm", import.meta.url));
  if (!response.ok)
    throw new Error(`Rust engine request failed (${response.status})`);
  const { instance } = await WebAssembly.instantiate(
    await response.arrayBuffer(),
    {},
  );
  const core = instance.exports;
  const decoder = new TextDecoder();
  let state, json;
  function refresh() {
    const ptr = core.nav_snapshot();
    json = decoder.decode(
      new Uint8Array(core.memory.buffer, ptr, core.nav_snapshot_len()),
    );
    state = JSON.parse(json);
  }
  core.nav_reset();
  refresh();
  const navEngine = {
    get state() {
      return state;
    },
    get json() {
      return json;
    },
    goal(x, y) {
      const result = core.nav_goal(x, y);
      refresh();
      return result;
    },
    tick() {
      core.nav_tick();
      refresh();
    },
    control(command) {
      if (command === 0) core.nav_reset();
      else if (command === 1) core.nav_pause(1);
      else if (command === 2) core.nav_pause(0);
      else if (command === 3) core.nav_cancel();
      else throw new Error(`Unknown ROS control: ${command}`);
      refresh();
    },
  };
  if (typeof window.createRosNavigation !== "function")
    throw new Error("ROS2WASM loader unavailable");
  const ros = await window.createRosNavigation({
    navEngine,
    locateFile: (file) => new URL(file, import.meta.url).href,
    print: (message) => console.debug("[ROS2WASM]", message),
    printErr: (message) => console.error("[ROS2WASM]", message),
  });
  function diagnostics() {
    return JSON.parse(ros.UTF8ToString(ros._ros_probe()));
  }
  const probe = diagnostics();
  if (probe.middleware !== "rmw_wasm_cpp" || probe.nodes.length !== 2) {
    throw new Error(
      "Expected real ROS2WASM middleware and two initialized rcl nodes",
    );
  }
  return Object.freeze({
    nav_goal: (x, y) => ros._ros_goal(x, y),
    nav_tick: () => ros._ros_tick(),
    nav_reset: () => ros._ros_reset(),
    nav_pause: (paused) => ros._ros_pause(paused),
    read: () => JSON.parse(ros.UTF8ToString(ros._ros_snapshot())),
    diagnostics,
    setGoalSubscriptionForTest: (enabled) =>
      ros._ros_test_goal_subscription(enabled ? 1 : 0),
  });
}
