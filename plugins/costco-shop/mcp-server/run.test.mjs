import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findRunnerFile, resolvePluginPaths } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, "..");
const marketplaceRoot = join(pluginRoot, "..", "..");
const runner = join(here, "run.mjs");

function hostCommand() {
  const mcp = JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf8"));
  return mcp.mcpServers.costco;
}

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
    const result = spawnSync(process.execPath, [runner, "--print-paths"], {
      cwd: "/",
      encoding: "utf8",
    });
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

  it("finds run.mjs from the marketplace workspace without plugin-root env", () => {
    const found = findRunnerFile();
    assert.equal(found, runner);
  });

  it("does not use unexpanded plugin-root or bash env placeholders", () => {
    const server = hostCommand();
    assert.equal(server.command, "node");
    assert.equal(server.args[0], "--input-type=module");
    assert.equal(server.args[1], "-e");
    assert.match(server.args[2], /mcp-server\/run\.mjs/);
    const blob = JSON.stringify(server);
    assert.equal(blob.includes("${CLAUDE_PLUGIN_ROOT}"), false);
    assert.equal(blob.includes("${COSTCO_DEMO_API_BASE"), false);
    assert.equal(blob.includes("${PLUGIN_ROOT}"), false);
  });

  it("host -e entry finds the plugin from marketplace cwd=/workspace", () => {
    const server = hostCommand();
    const result = spawnSync(server.command, server.args, {
      cwd: marketplaceRoot,
      encoding: "utf8",
      env: { ...process.env, COSTCO_MCP_PRINT_PATHS: "1" },
    });
    assert.equal(result.status, 0, result.stderr);
    const printed = JSON.parse(result.stdout);
    assert.equal(printed.entry, join(here, "index.ts"));
  });

  it("host -e entry uses CLAUDE_PLUGIN_ROOT when cwd has no plugin files", () => {
    const server = hostCommand();
    const result = spawnSync(server.command, server.args, {
      cwd: "/tmp",
      encoding: "utf8",
      env: {
        ...process.env,
        COSTCO_MCP_PRINT_PATHS: "1",
        CLAUDE_PLUGIN_ROOT: pluginRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const printed = JSON.parse(result.stdout);
    assert.equal(printed.entry, join(here, "index.ts"));
  });
});

describe("shopper-facing copy", () => {
  const skill = readFileSync(join(pluginRoot, "skills/costco-shop/SKILL.md"), "utf8");
  const mcpSources = ["index.ts", "copy.ts", "savings.ts"]
    .map((name) => readFileSync(join(here, name), "utf8"))
    .join("\n");

  it("skill no longer tells the bot to say this is a demo or ask about mood boards", () => {
    assert.equal(/Always say this is a demo/i.test(skill), false);
    assert.equal(/Demo only; not affiliated/i.test(skill), false);
    assert.match(skill, /Never say [“"]demo/i);
    assert.match(skill, /Never ask/i);
    assert.match(skill, /mood board/i);
    assert.match(skill, /\*\*Purchase\*\*/);
    assert.match(skill, /\*\*Make swaps\*\*/);
    assert.match(skill, /You saved/);
  });

  it("MCP success path no longer injects shopper-facing demo disclaimers", () => {
    assert.equal(mcpSources.includes("DEMO_DISCLAIMER"), false);
    assert.equal(mcpSources.includes("Demo only"), false);
    assert.equal(mcpSources.includes("not affiliated"), false);
    assert.equal(/demo:\s*true/.test(mcpSources), false);
    assert.equal(mcpSources.includes("withDisclaimer"), false);
    assert.match(mcpSources, /youSaved/);
    assert.match(mcpSources, /savingsLabel/);
  });
});
