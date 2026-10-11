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
