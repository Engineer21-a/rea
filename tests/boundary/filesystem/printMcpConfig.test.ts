import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

import { PRODUCT_IDENTITY } from "../../../src/identity.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const exec = promisify(execFile);
const script = fileURLToPath(
  new URL("../../../scripts/print-mcp-config.mjs", import.meta.url),
);
const print = (...args: string[]) =>
  exec(process.execPath, [script, ...args], { encoding: "utf8" });

it("pins the printed registration to the checkout's package version", async () => {
  const target = join(
    await createTestTempDirectory("rea-print-mcp-config-"),
    "x",
  );
  const { stdout } = await print(target, "--kind", "database");
  expect(JSON.parse(stdout)).toEqual({
    mcpServers: {
      [PRODUCT_IDENTITY.mcpServerKey]: {
        command: "npx",
        args: ["-y", PRODUCT_IDENTITY.registrationPackageSpecifier, "mcp"],
        env: { HOPPER_TARGET_PATH: target, HOPPER_TARGET_KIND: "database" },
      },
    },
  });
});

it.each([
  ["an unsupported kind", ["--kind", "db"]],
  ["a kind flag without a value", ["--kind"]],
  ["a loader-args flag without a value", ["--loader-args"]],
])("rejects %s with usage", async (_label, flags) => {
  const target = join(
    await createTestTempDirectory("rea-print-mcp-config-"),
    "x",
  );
  await expect(print(target, ...flags)).rejects.toMatchObject({
    code: 1,
    stdout: "",
    stderr: expect.stringContaining("Usage: node scripts/print-mcp-config.mjs"),
  });
});
