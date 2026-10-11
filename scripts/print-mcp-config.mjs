#!/usr/bin/env node
/**
 * Print a ready-to-paste MCP server config with absolute paths filled in.
 *
 * Usage:
 *   node scripts/print-mcp-config.mjs /path/to/binary
 *   node scripts/print-mcp-config.mjs /path/to/binary --kind database
 *   node scripts/print-mcp-config.mjs /path/to/binary --loader-args '["-l","Mach-O","--aarch64"]'
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const USAGE =
  "Usage: node scripts/print-mcp-config.mjs <target-path> [--kind executable|database] [--loader-args JSON]\n";

const targetPath = process.argv[2];
if (!targetPath) exitWithUsage();

const flags = process.argv.slice(3);
const kind = readFlag(flags, "--kind") ?? "executable";
if (kind !== "executable" && kind !== "database") exitWithUsage();
const loaderArgs = readFlag(flags, "--loader-args");
// Pin the registration to this checkout's version, like rea setup does
// (PRODUCT_IDENTITY.registrationPackageSpecifier), instead of @latest.
const pkg = JSON.parse(
  await readFile(
    resolve(fileURLToPath(new URL("..", import.meta.url)), "package.json"),
    "utf8",
  ),
);

const env = {
  HOPPER_TARGET_PATH: resolve(targetPath),
  HOPPER_TARGET_KIND: kind,
};
if (loaderArgs) env.HOPPER_LOADER_ARGS_JSON = loaderArgs;

const config = {
  mcpServers: {
    rea: {
      command: "npx",
      args: ["-y", `${pkg.name}@${pkg.version}`, "mcp"],
      env,
    },
  },
};

process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);

function readFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  if (i + 1 >= args.length) exitWithUsage();
  return args[i + 1];
}

function exitWithUsage() {
  process.stderr.write(USAGE);
  process.exit(1);
}
