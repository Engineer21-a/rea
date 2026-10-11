import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";
import { createSourceLineIndex } from "./javascriptStaticAnalysisHelpers.js";

const directive = "//# sourceMappingURL=app.js.map";

describe("source map directive coordinates", () => {
  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
    ["line separator", "\u2028"],
    ["paragraph separator", "\u2029"],
    ["same-line UTF-16 columns", " "],
    ["vertical tab whitespace", "\v"],
    ["form feed whitespace", "\f"],
    ["mixed terminators", "\r\n\r\u2028\n\u2029"],
  ])("agrees with Babel after %s", (_name, separator) => {
    const source = `const marker = "😀";${separator}  ${directive}`;
    const location = parse(source).comments?.[0]?.loc;
    if (location === undefined)
      throw new Error("Expected the directive comment location");
    const { start, end } = location;

    const result = analyzeJavaScriptStaticSource(source);
    expect(result.parse_status).toBe("complete");
    expect(result.source_map_urls).toEqual([
      {
        declared_url: "app.js.map",
        location: {
          start: { line: start.line, column: start.column },
          end: { line: end.line, column: end.column },
        },
      },
    ]);
  });

  it("counts terminators inside a block directive without including its closer", () => {
    const source =
      "const value = 1;\r/*#\u2028 sourceMappingURL=\r\n app.js.map */";
    expect(analyzeJavaScriptStaticSource(source).source_map_urls).toEqual([
      {
        declared_url: "app.js.map",
        location: {
          start: { line: 2, column: 0 },
          end: { line: 4, column: " app.js.map".length },
        },
      },
    ]);
  });

  it("preserves the first location when a URL is repeated across terminators", () => {
    const source = `const marker = "😀";\r  ${directive}\u2028${directive}`;
    expect(analyzeJavaScriptStaticSource(source).source_map_urls).toEqual([
      {
        declared_url: "app.js.map",
        location: {
          start: { line: 2, column: 2 },
          end: { line: 2, column: directive.length + 2 },
        },
      },
    ]);
  });

  it("resolves every offset exactly as a prefix split over mixed terminators", () => {
    const source = "a\r\nb\rc\u2028😀\u2029\n\r\n\r\rend\r\n";
    const prefixPoint = (offset: number) => {
      const lines = source.slice(0, offset).split(/\r\n|[\n\r\u2028\u2029]/u);
      return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
    };
    const lines = createSourceLineIndex(source);
    for (let offset = 0; offset <= source.length; offset += 1)
      expect(lines.range(offset, offset)).toEqual({
        start: prefixPoint(offset),
        end: prefixPoint(offset),
      });
  });

  it("agrees with Babel for distinct directives across mixed terminators", () => {
    const separators = ["\n", "\r\n", "\r", "\u2028", "\u2029"];
    const source = Array.from(
      { length: 50 },
      (_value, index) =>
        `f${index}("😀");${separators[index % separators.length]}` +
        `//# sourceMappingURL=app${index}.js.map${separators[(index + 2) % separators.length]}`,
    ).join("");
    const expected = (parse(source).comments ?? []).map(({ value, loc }) => ({
      declared_url: value.slice("# sourceMappingURL=".length),
      location: {
        start: { line: loc?.start.line, column: loc?.start.column },
        end: { line: loc?.end.line, column: loc?.end.column },
      },
    }));
    expect(expected).toHaveLength(50);
    expect(
      [...analyzeJavaScriptStaticSource(source).source_map_urls].sort(
        (left, right) => left.location.start.line - right.location.start.line,
      ),
    ).toEqual(expected);
  });

  it("resolves many repeated directives without rescanning the source", () => {
    const source = `x();\r\n${`${directive}\r\n${directive}\u2028`.repeat(100_000)}`;
    const started = performance.now();
    const result = analyzeJavaScriptStaticSource(source);
    expect(performance.now() - started).toBeLessThan(20_000);
    expect(result.source_map_urls).toEqual([
      {
        declared_url: "app.js.map",
        location: {
          start: { line: 2, column: 0 },
          end: { line: 2, column: directive.length },
        },
      },
    ]);
  }, 30_000);
});
