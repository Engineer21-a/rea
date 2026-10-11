#!/usr/bin/env node
// Smoke-test a REA container image through the same stdio MCP path an agent
// uses: initialize, list tools, and run one static analysis on a temporary
// JavaScript application mounted read-only without network access.
//
//   node docker/smoke-test.mjs [image]   (default image: rea:local)

import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const image = process.argv[2] ?? "rea:local";
const deadlineMs = 120_000;
const target = await mkdtemp(join(tmpdir(), "rea-smoke-"));
// mkdtemp creates 0700; the container user (uid 1000) must be able to read it.
await chmod(target, 0o755);
await writeFile(join(target, "index.js"), 'console.log("rea");\n');
await writeFile(
  join(target, "package.json"),
  JSON.stringify({ name: "rea-smoke", version: "1.0.0", main: "index.js" }),
);

const child = spawn(
  "docker",
  [
    "run",
    "-i",
    "--rm",
    "--network",
    "none",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-v",
    `${target}:${target}:ro`,
    "-w",
    target,
    image,
    "mcp",
  ],
  { stdio: ["pipe", "pipe", "inherit"] },
);

const pending = new Map();
createInterface({ input: child.stdout }).on("line", (line) => {
  if (line.trim() === "") return;
  const message = JSON.parse(line);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});

let nextId = 0;
const request = (method, params) =>
  new Promise((resolve) => {
    nextId += 1;
    pending.set(nextId, resolve);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: nextId, method, params })}\n`,
    );
  });

const fail = (reason) => {
  throw new Error(`REA image smoke test failed: ${reason}`);
};

const timer = setTimeout(() => {
  process.stderr.write(
    `REA image smoke test timed out after ${deadlineMs} ms\n`,
  );
  child.kill();
  process.exit(1);
}, deadlineMs);

try {
  const initialized = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "rea-docker-smoke-test", version: "1.0.0" },
  });
  if (initialized.result?.serverInfo?.name !== "rea")
    fail(`unexpected initialize result ${JSON.stringify(initialized)}`);
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );

  const listed = await request("tools/list", {});
  const tools = listed.result?.tools ?? [];
  if (!tools.some((tool) => tool.name === "analyze_javascript_application"))
    fail(
      `analyze_javascript_application is not listed (${tools.length} tools)`,
    );

  const called = await request("tools/call", {
    name: "analyze_javascript_application",
    arguments: { input_path: target },
  });
  const text = called.result?.content?.[0]?.text ?? "";
  if (called.result?.isError === true || !text.includes('"evidence_id"'))
    fail(`analysis returned no Evidence: ${text.slice(0, 500)}`);

  process.stdout.write(
    `REA image ${image}: ${initialized.result.serverInfo.version}, ${tools.length} tools, static analysis returned Evidence\n`,
  );
} finally {
  clearTimeout(timer);
  child.stdin.end();
  child.kill();
  await rm(target, { recursive: true, force: true });
}
