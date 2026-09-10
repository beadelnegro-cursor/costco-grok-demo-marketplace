#!/usr/bin/env node
/**
 * Stdio MCP launcher that does not depend on ${CLAUDE_PLUGIN_ROOT} in .mcp.json.
 *
 * Grok Bot (and some Cursor hosts) pass args through without expanding that
 * placeholder, so `tsx ${CLAUDE_PLUGIN_ROOT}/mcp-server/index.ts` becomes
 * `/<cwd>/${CLAUDE_PLUGIN_ROOT}/mcp-server/index.ts`. This file locates the
 * plugin from its own URL (import.meta.url), then starts ./index.ts next to it.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_NAME = "costco-shop";

function isUsableRoot(value) {
  return Boolean(value) && !String(value).includes("${");
}

function serverDirIfPresent(dir) {
  return dir && existsSync(join(dir, "index.ts")) ? dir : null;
}

/** Directory that contains index.ts, resolved from this running file first. */
export function resolveServerDir(metaUrl = import.meta.url) {
  const fromThisFile = serverDirIfPresent(dirname(fileURLToPath(metaUrl)));
  if (fromThisFile) return fromThisFile;

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

  throw new Error(
    `[costco-mcp] cannot find mcp-server/index.ts from ${metaUrl} (cwd=${process.cwd()}). Run from the plugin root or set CLAUDE_PLUGIN_ROOT.`,
  );
}

export function resolvePluginPaths(metaUrl = import.meta.url) {
  const serverDir = resolveServerDir(metaUrl);
  return {
    serverDir,
    entry: join(serverDir, "index.ts"),
    pluginRoot: resolve(serverDir, ".."),
    via: serverDirIfPresent(dirname(fileURLToPath(metaUrl)))
      ? "import.meta.url"
      : "host-env-or-cwd",
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

const invokedDirectly =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (process.argv.includes("--print-paths")) {
  process.stdout.write(`${JSON.stringify(resolvePluginPaths(), null, 2)}\n`);
} else if (invokedDirectly || process.argv.includes("--launch")) {
  launch();
}
