import { mkdir, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";

import { expect } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { cliTest } from "../../support/cli/cliFixture.js";

// A shell-completed bundle path ends in a separator. The bundle stays on the
// native app route either way, even when it also holds JavaScript sources.
for (const suffix of ["", sep]) {
  cliTest(
    `analyze keeps an app bundle on the native route (suffix ${JSON.stringify(suffix)})`,
    async ({ cli }) => {
      const root = await createTestTempDirectory("rea-analyze-app-route-");
      const bundle = join(root, "Example.app");
      await mkdir(bundle);
      await writeFile(join(bundle, "main.js"), "fetch('');\n");

      const output = await cli.run({
        arguments: ["analyze", `${bundle}${suffix}`, "--json"],
      });

      expect(output.exitCode).not.toBe(0);
      expect(output.json).toMatchObject({
        code: "target_unavailable",
        details: {
          reason: expect.stringContaining("app Info.plist is missing"),
        },
      });
      expect(output.stderr).not.toContain("parse_javascript_sources");
    },
  );
}
