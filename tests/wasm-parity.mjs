import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const module = await WebAssembly.compile(readFileSync("dist/nav_core.wasm"));
assert.deepEqual(
  WebAssembly.Module.imports(module),
  [],
  "WASM must need no server or host imports",
);
const instance = await WebAssembly.instantiate(module, {});
const api = instance.exports;
api.nav_reset();
api.nav_goal(7.0, 2.6);
for (let i = 0; i < 37; i++) api.nav_tick();
api.nav_goal(2.6, 3.0);
for (let i = 0; i < 100; i++) api.nav_tick();
const ptr = api.nav_snapshot();
const wasm = JSON.parse(
  new TextDecoder().decode(
    new Uint8Array(api.memory.buffer, ptr, api.nav_snapshot_len()),
  ),
);
const native = JSON.parse(
  execFileSync("cargo", ["run", "--quiet", "--locked", "--example", "trace"], {
    encoding: "utf8",
  }),
);
function compare(a, b, path = "snapshot") {
  if (typeof a === "number") {
    assert.ok(Math.abs(a - b) < 1e-10, `${path}: ${a} != ${b}`);
    return;
  }
  if (a && typeof a === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b));
    for (const k of Object.keys(a)) compare(a[k], b[k], `${path}.${k}`);
    return;
  }
  assert.equal(a, b, path);
}
compare(wasm, native);
console.log(
  "PASS: import-free WASM and native Rust produce matching snapshots after goal replacement.",
);
