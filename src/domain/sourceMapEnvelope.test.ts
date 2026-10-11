import { describe, expect, it } from "vitest";

import { flattenSourceMapLeaves, isVersion3Map } from "./sourceMapEnvelope.js";

const leaf = {
  version: 3,
  mappings: "AAAA",
  sources: ["app.ts"],
  names: [],
};

describe("source-map envelope walk", () => {
  it("accepts version-3 maps and rejects other shapes", () => {
    expect(isVersion3Map(leaf)).toBe(true);
    expect(isVersion3Map({ version: 2, mappings: "AAAA" })).toBe(false);
    expect(isVersion3Map(null)).toBe(false);
    expect(isVersion3Map([{ version: 3 }])).toBe(false);
  });

  it("collects indexed section leaves in declared order without validating offsets", () => {
    const section = (source: string, line: number) => ({
      offset: { line, column: 0 },
      map: { ...leaf, sources: [source] },
    });
    const flat = {
      version: 3,
      sections: [section("first.ts", 0), section("second.ts", 10)],
    };
    expect(flattenSourceMapLeaves(flat)?.map((map) => map.sources)).toEqual([
      ["first.ts"],
      ["second.ts"],
    ]);
    const nested = {
      version: 3,
      sections: [
        section("a.ts", 0),
        {
          offset: { line: 10, column: 0 },
          map: {
            version: 3,
            sections: [section("b.ts", 0), section("c.ts", 5)],
          },
        },
        section("d.ts", 20),
      ],
    };
    expect(flattenSourceMapLeaves(nested)?.map((map) => map.sources)).toEqual([
      ["a.ts"],
      ["b.ts"],
      ["c.ts"],
      ["d.ts"],
    ]);
  });

  it("rejects non-map sections and flattens sections without valid offsets", () => {
    const missing = {
      version: 3,
      sections: [{ offset: { line: 0, column: 0 } }],
    };
    expect(flattenSourceMapLeaves(missing)).toBeUndefined();
    expect(
      flattenSourceMapLeaves({
        version: 3,
        sections: [{ offset: { line: -1, column: 0 }, map: leaf }],
      }),
    ).toEqual([leaf]);
    expect(
      flattenSourceMapLeaves({ version: 3, sections: [{ map: leaf }] }),
    ).toEqual([leaf]);
  });

  it("rejects non-version-3 roots and nested maps", () => {
    expect(flattenSourceMapLeaves({ version: 3 })).toHaveLength(1);
    expect(flattenSourceMapLeaves({ mappings: "AAAA" })).toBeUndefined();
    expect(
      flattenSourceMapLeaves({
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, map: { version: 2 } }],
      }),
    ).toBeUndefined();
  });
});
