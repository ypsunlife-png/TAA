const test = require("node:test");
const assert = require("node:assert/strict");

test("routes module should export registerRoutes", () => {
  const mod = require("../lib/routes");
  assert.equal(typeof mod.registerRoutes, "function");
});
