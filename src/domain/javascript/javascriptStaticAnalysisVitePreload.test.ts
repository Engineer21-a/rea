import { expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";

const dynamicImports = (source: string): readonly (string | null)[] =>
  analyzeJavaScriptStaticSource(source)
    .references.filter(({ kind }) => kind === "dynamic-import")
    .map(({ specifier }) => specifier);

it("resolves __vite__mapDeps indexes through a table declared after the calls", () => {
  const source = [
    "__vite__mapDeps([1]);",
    "__vite__mapDeps([0, 1]);",
    "const __vite__mapDeps = (i, m = __vite__mapDeps,",
    '  d = (m.f || (m.f = [\'./a.js\', "./b\\".css"]))) => i.map((x) => d[x]);',
  ].join("\n");
  expect(dynamicImports(source)).toEqual(
    expect.arrayContaining(["./a.js", './b\\".css']),
  );
});

it("scans hostile unterminated Vite table fragments in linear time", () => {
  const fragments = ".f||(.f=[".repeat(200_000);
  const calls = "__vite__mapDeps([0]);".repeat(2_000);
  const started = performance.now();
  expect(dynamicImports(`${calls}/*${fragments}*/`)).toEqual([]);
  expect(
    dynamicImports(`${calls}x.f||(x.f=["${'\\"'.repeat(200_000)}])`),
  ).toEqual([]);
  // The former backtracking pattern needed seconds for 18 KB of fragments.
  expect(performance.now() - started).toBeLessThan(10_000);
});
