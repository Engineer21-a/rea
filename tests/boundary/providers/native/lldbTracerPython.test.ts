import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it } from "vitest";

const execute = promisify(execFile);
const tracerTests = fileURLToPath(
  new URL("../../../../bridge/native/test_rea_lldb_tracer.py", import.meta.url),
);

// Only a missing interpreter skips; a python3 that exists but fails to run
// must fail the suite rather than hide the tracer's retention tests.
const pythonUnavailable = await execute("python3", ["-I", "-c", "pass"], {
  timeout: 30_000,
}).then(
  () => false,
  (cause: unknown) =>
    cause instanceof Error && "code" in cause && cause.code === "ENOENT",
);

it.skipIf(pythonUnavailable)(
  "passes the LLDB tracer's source-owned Python retention tests",
  async () => {
    // The bridge directory is not a package, so run the module as a script.
    const { stderr } = await execute("python3", ["-I", tracerTests], {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    expect(stderr).toMatch(/^Ran [1-9]\d* tests? in /mu);
    expect(stderr).toMatch(/^OK$/mu);
  },
);
