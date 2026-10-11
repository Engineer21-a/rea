import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { importReferenceSource } from "../../support/referenceSourceResourceScope.js";

it("keeps empty module specifiers as unknown edges without failing the import", async () => {
  const root = await createTestTempDirectory("rea-reference-empty-specifier-");
  await Promise.all([
    writeFile(
      join(root, "main.js"),
      [
        'import kept from "./kept";',
        'import a from "";',
        'require("");',
        'const lazy = import("");',
      ].join("\n"),
    ),
    writeFile(join(root, "kept.js"), "export default 1;\n"),
  ]);

  const result = await importReferenceSource({
    root,
    caller: "reference-empty-specifier-test",
    policy: { secretPatterns: [] },
  });
  if (!result.ok) throw result.error;
  expect(result.value.parse_failures).toEqual([]);
  expect(result.value.relationships).toContainEqual({
    from_path: "main.js",
    to: "kept.js",
    kind: "imports",
    resolution: "internal",
    parse_state: "parsed",
  });
  for (const kind of ["imports", "requires"])
    expect(result.value.relationships).toContainEqual({
      from_path: "main.js",
      to: "<empty-specifier>",
      kind,
      resolution: "unknown",
      parse_state: "partial",
    });
  expect(
    result.value.relationships.filter((relationship) => relationship.to === ""),
  ).toEqual([]);
});
