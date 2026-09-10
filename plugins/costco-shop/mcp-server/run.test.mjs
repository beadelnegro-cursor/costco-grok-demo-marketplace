import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePluginPaths } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, "..");

describe("costco MCP launcher", () => {
  it("resolves the plugin directory from this file, not cwd", () => {
    const resolved = resolvePluginPaths(import.meta.url);
    assert.equal(resolved.via, "import.meta.url");
    assert.equal(resolved.serverDir, here);
    assert.equal(resolved.pluginRoot, pluginRoot);
    assert.equal(resolved.entry, join(here, "index.ts"));
    assert.ok(existsSync(resolved.entry));
  });

  it("prints the same paths when spawned from a different cwd", () => {
    const result = spawnSync(
      process.execPath,
      [join(here, "run.mjs"), "--print-paths"],
      { cwd: "/", encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const printed = JSON.parse(result.stdout);
    assert.equal(printed.via, "import.meta.url");
    assert.equal(printed.entry, join(here, "index.ts"));
    assert.equal(printed.pluginRoot, pluginRoot);
  });

  it("falls back to cwd / marketplace layout when the file URL is elsewhere", () => {
    const resolved = resolvePluginPaths(pathToFileURL("/tmp/not-the-plugin.mjs").href);
    assert.equal(resolved.via, "host-env-or-cwd");
    assert.equal(resolved.entry, join(here, "index.ts"));
  });

  it("does not use unexpanded ${CLAUDE_PLUGIN_ROOT} or bash env defaults", () => {
    const mcp = JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf8"));
    const server = mcp.mcpServers.costco;
    assert.equal(server.command, "node");
    assert.deepEqual(server.args, ["./mcp-server/run.mjs"]);
    const blob = JSON.stringify(server);
    assert.equal(blob.includes("${CLAUDE_PLUGIN_ROOT}"), false);
    assert.equal(blob.includes("${COSTCO_DEMO_API_BASE"), false);
  });
});
