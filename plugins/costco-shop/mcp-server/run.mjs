#!/usr/bin/env node
/**
 * Stdio MCP launcher that does not depend on ${CLAUDE_PLUGIN_ROOT} in .mcp.json.
 *
 * Grok Bot (and some Cursor hosts) pass args through without expanding that
 * placeholder, so `tsx ${CLAUDE_PLUGIN_ROOT}/mcp-server/index.ts` becomes
 * `/<cwd>/${CLAUDE_PLUGIN_ROOT}/mcp-server/index.ts`. This file locates the
 * plugin from its own URL (import.meta.url), then starts ./index.ts next to it.
 *
 * .mcp.json starts this file via `node` + a small -e locator so the host does
 * not need to expand plugin-root placeholders or set cwd to the plugin.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_NAME = "costco-shop";
const PLACEHOLDER_MARK = "$" + "{";

function isUsableRoot(value) {
  return Boolean(value) && !String(value).includes(PLACEHOLDER_MARK);
}

function runnerAt(root) {
  if (!isUsableRoot(root)) return "";
  const runner = join(root, "mcp-server", "run.mjs");
  return existsSync(runner) ? runner : "";
}

function serverDirIfPresent(dir) {
  return dir && existsSync(join(dir, "index.ts")) ? dir : null;
}

function walkForPlugin(dir, depth, hits) {
  if (depth < 0) return;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.name === PLUGIN_NAME) {
      const runner = runnerAt(dir);
      if (runner) hits.push({ runner, score: statSync(runner).mtimeMs });
    }
  } catch {
    // no package.json or not this plugin
  }

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name === "node_modules" ||
      entry.name === ".git"
    ) {
      continue;
    }
    walkForPlugin(join(dir, entry.name), depth - 1, hits);
  }
}

/** Locate run.mjs when the host cwd is the user workspace, not the plugin. */
export function findRunnerFile() {
  const ranked = [];
  const prefer = (runner) => {
    if (runner) ranked.push({ runner, score: Number.POSITIVE_INFINITY });
  };

  for (const key of ["CLAUDE_PLUGIN_ROOT", "CURSOR_PLUGIN_ROOT", "PLUGIN_ROOT"]) {
    prefer(runnerAt(process.env[key]));
  }
  prefer(runnerAt(process.cwd()));
  prefer(runnerAt(join(process.cwd(), "plugins", PLUGIN_NAME)));

  for (const rel of [".cursor/plugins/cache", ".claude/plugins", ".grok/plugins"]) {
    const cache = join(homedir(), rel);
    if (existsSync(cache)) walkForPlugin(cache, 6, ranked);
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.runner ?? "";
}

/** Directory that contains index.ts, resolved from this running file first. */
export function resolveServerDir(metaUrl = import.meta.url) {
  try {
    const fromThisFile = serverDirIfPresent(dirname(fileURLToPath(metaUrl)));
    if (fromThisFile) return fromThisFile;
  } catch {
    // import.meta.url may be an eval URL when used as a host -e entry
  }

  for (const key of ["CLAUDE_PLUGIN_ROOT", "CURSOR_PLUGIN_ROOT", "PLUGIN_ROOT"]) {
    const root = process.env[key];
    if (!isUsableRoot(root)) continue;
    const found = serverDirIfPresent(join(root, "mcp-server"));
    if (found) return found;
  }

  for (const dir of [
    join(process.cwd(), "mcp-server"),
    join(process.cwd(), "plugins", PLUGIN_NAME, "mcp-server"),
  ]) {
    const found = serverDirIfPresent(dir);
    if (found) return found;
  }

  const runner = findRunnerFile();
  if (runner) {
    const found = serverDirIfPresent(dirname(runner));
    if (found) return found;
  }

  throw new Error(
    `[costco-mcp] cannot find mcp-server/index.ts from ${metaUrl} (cwd=${process.cwd()}).`,
  );
}

export function resolvePluginPaths(metaUrl = import.meta.url) {
  let via = "host-env-or-cwd";
  try {
    if (serverDirIfPresent(dirname(fileURLToPath(metaUrl)))) {
      via = "import.meta.url";
    }
  } catch {
    via = "host-env-or-cwd";
  }

  const serverDir = resolveServerDir(metaUrl);
  return {
    serverDir,
    entry: join(serverDir, "index.ts"),
    pluginRoot: resolve(serverDir, ".."),
    via,
  };
}

function tsxCommand(pluginRoot, entry) {
  const localTsx = join(pluginRoot, "node_modules", ".bin", "tsx");
  if (existsSync(localTsx)) {
    return { command: localTsx, args: [entry] };
  }
  return { command: "npx", args: ["-y", "tsx", entry] };
}

export function launch(metaUrl = import.meta.url) {
  const { entry, pluginRoot, via } = resolvePluginPaths(metaUrl);
  if (!existsSync(entry)) {
    throw new Error(`[costco-mcp] missing server entry ${entry}`);
  }

  const { command, args } = tsxCommand(pluginRoot, entry);
  console.error(`[costco-mcp] launching ${entry} (${via})`);

  const child = spawn(command, args, {
    stdio: "inherit",
    cwd: pluginRoot,
    env: process.env,
  });

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  child.on("error", (error) => {
    console.error(
      `[costco-mcp] failed to spawn ${command}:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
  return child;
}

export function main(metaUrl = import.meta.url) {
  if (
    process.argv.includes("--print-paths") ||
    process.env.COSTCO_MCP_PRINT_PATHS
  ) {
    process.stdout.write(`${JSON.stringify(resolvePluginPaths(metaUrl), null, 2)}\n`);
    return;
  }
  launch(metaUrl);
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly || process.argv.includes("--launch")) {
  main();
}
