import { describe, expect, it } from "vitest";

import {
  parseCustomPromptDocument,
  renderCustomPrompt,
} from "./customPrompt.js";

const DOCUMENT = `---
name: static_triage
title: Static triage
description: Triage a sample without running it.
arguments:
  sample_path:
    description: Absolute path of the sample
    required: true
  report_language:
    description: Language of the final report
    default: English
---
Analyze {{ sample_path }} statically.
Write the report in {{report_language}}.
`;

describe("custom prompt documents", () => {
  it("parses front matter and renders values, defaults and omissions", () => {
    const parsed = parseCustomPromptDocument(`﻿${DOCUMENT}`, "a.md");
    if (!parsed.ok) throw new Error(parsed.error.reason);
    expect(parsed.value).toMatchObject({
      name: "static_triage",
      title: "Static triage",
      arguments: {
        sample_path: { required: true },
        report_language: { required: false, default: "English" },
      },
      source: "a.md",
    });
    expect(
      renderCustomPrompt(parsed.value, {
        sample_path: "/samples/a.bin",
        unrelated: "ignored",
      }),
    ).toBe("Analyze /samples/a.bin statically.\nWrite the report in English.");
    expect(
      renderCustomPrompt(parsed.value, {
        sample_path: "/samples/a.bin",
        report_language: "Hrvatski",
      }),
    ).toContain("Write the report in Hrvatski.");
  });

  it("renders arguments named like Object.prototype members", () => {
    const parsed = parseCustomPromptDocument(
      [
        "---",
        "name: proto",
        "title: Proto",
        "description: Prototype-named arguments.",
        "arguments:",
        "  constructor:",
        "    description: Optional value",
        "---",
        "[{{constructor}}]",
      ].join("\n"),
      "proto.md",
    );
    if (!parsed.ok) throw new Error(parsed.error.reason);
    expect(renderCustomPrompt(parsed.value, {})).toBe("[]");
    expect(renderCustomPrompt(parsed.value, { constructor: "x" })).toBe("[x]");
  });

  it("parses long whitespace inside braces in linear time", () => {
    const document = `${DOCUMENT}\n{{${" ".repeat(200_000)}`;
    const started = performance.now();
    expect(parseCustomPromptDocument(document, "spaces.md").ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it.each([
    ["no front matter", "Just text", /missing YAML front matter/u],
    [
      "an invalid name",
      DOCUMENT.replace("name: static_triage", "name: Static-Triage"),
      /name: use lowercase/u,
    ],
    [
      "an unknown key",
      DOCUMENT.replace("title:", "model: any\ntitle:"),
      /model/u,
    ],
    [
      "a required default",
      DOCUMENT.replace("required: true", "required: true\n    default: x"),
      /required argument cannot have a default/u,
    ],
    [
      "an undeclared placeholder",
      `${DOCUMENT}\n{{target}} and {{ target }}`,
      /undeclared placeholders: \{\{target\}\}$/u,
    ],
    [
      "an empty template",
      DOCUMENT.slice(0, DOCUMENT.indexOf("Analyze")),
      /template after the front matter is empty/u,
    ],
    ["broken YAML", "---\nname: [x\n---\nBody", /invalid YAML front matter/u],
  ])("rejects %s with a reason", (_case, document, reason) => {
    const parsed = parseCustomPromptDocument(document, "bad.md");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatchObject({
      _tag: "CustomPromptRejection",
      source: "bad.md",
    });
    expect(parsed.error.reason).toMatch(reason);
  });
});
