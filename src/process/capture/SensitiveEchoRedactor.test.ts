import { describe, expect, it } from "vitest";

import {
  redactedInputPlaceholder,
  SensitiveEchoRedactor,
} from "./SensitiveEchoRedactor.js";

const redact = (
  inputs: readonly string[],
  chunks: readonly string[],
): { readonly released: readonly string[]; readonly output: string } => {
  const redactor = new SensitiveEchoRedactor();
  for (const input of inputs) redactor.addSensitiveInput(input);
  const released = [
    ...chunks.map((chunk) => redactor.write(chunk)),
    redactor.flush(),
  ];
  return { released, output: released.join("") };
};

describe("SensitiveEchoRedactor", () => {
  it("passes output through unchanged when no sensitive input was dispatched", () => {
    expect(redact([], ["secret\r\n", "more"]).released).toEqual([
      "secret\r\n",
      "more",
      "",
    ]);
  });

  it("does not delay non-matching output", () => {
    const { released } = redact(["secret\r"], ["prompt> ", "status ok\r\n"]);
    expect(released).toEqual(["prompt> ", "status ok\r\n", ""]);
  });

  it("replaces CR echoed as CRLF with the interaction-log placeholder", () => {
    expect(redact(["secret\r"], ["before secret\r\nafter"]).output).toBe(
      `before ${redactedInputPlaceholder("secret\r")}after`,
    );
    expect(redactedInputPlaceholder("secret\r")).toBe(
      "<redacted-input:7-bytes>",
    );
  });

  it.each([
    ["CR as LF", "pin\r", "pin\n"],
    ["CR as ^M under ECHOCTL", "pin\r", "pin^M"],
    ["LF as CRLF", "pin\n", "pin\r\n"],
    ["ESC as ^[", "a\u001bb", "a^[b"],
    ["DEL as ^?", "a\u007f", "a^?"],
    ["control characters verbatim", "a\u0001", "a\u0001"],
  ])("matches %s echo forms", (_name, input, echo) => {
    expect(redact([input], [`<${echo}>`]).output).toBe(
      `<${redactedInputPlaceholder(input)}>`,
    );
  });

  it("carries partial matches across every chunk split", () => {
    const echo = "xx hunter2\r\nyy";
    for (let split = 0; split <= echo.length; split += 1) {
      const { released, output } = redact(
        ["hunter2\r"],
        [echo.slice(0, split), echo.slice(split)],
      );
      expect(output).toBe(`xx ${redactedInputPlaceholder("hunter2\r")}yy`);
      expect(released.join("")).not.toContain("hunter");
    }
  });

  it("waits for a possible LF before choosing the shorter CR echo", () => {
    const redactor = new SensitiveEchoRedactor();
    redactor.addSensitiveInput("pw\r");
    expect(redactor.write("pw\r")).toBe("");
    expect(redactor.write("\nnext")).toBe(
      `${redactedInputPlaceholder("pw\r")}next`,
    );
    redactor.addSensitiveInput("ab\r");
    expect(redactor.write("ab\r")).toBe("");
    expect(redactor.flush()).toBe(redactedInputPlaceholder("ab\r"));
  });

  it("releases held non-matching output once the stream ends", () => {
    expect(redact(["secret"], ["output ends with sec"]).released).toEqual([
      "output ends with ",
      "sec",
    ]);
  });

  it("redacts repeated echoes and prefers the longest overlapping secret", () => {
    const { output } = redact(
      ["pass", "password\r", "pass"],
      ["password\r\n pass pass"],
    );
    expect(output).toBe(
      `${redactedInputPlaceholder("password\r")} ${redactedInputPlaceholder("pass")} ${redactedInputPlaceholder("pass")}`,
    );
  });

  it("uses the leftmost echo when secrets overlap", () => {
    const { output } = redact(["abab", "baba"], ["xababay"]);
    expect(output).toBe(`x${redactedInputPlaceholder("abab")}ay`);
  });

  it("redacts one echo per dispatch and keeps later look-alike output", () => {
    expect(redact(["y\r"], ["y\r\nready\r\nsay\r\n"]).output).toBe(
      `${redactedInputPlaceholder("y\r")}ready\r\nsay\r\n`,
    );
    expect(redact(["\r"], ["\r\nline one\r\nline two\r\n"]).output).toBe(
      `${redactedInputPlaceholder("\r")}line one\r\nline two\r\n`,
    );
  });

  it("redacts every echo of an input dispatched several times", () => {
    const redactor = new SensitiveEchoRedactor();
    redactor.addSensitiveInput("pin\r");
    expect(redactor.write("pin\r\nok\r\n")).toBe(
      `${redactedInputPlaceholder("pin\r")}ok\r\n`,
    );
    expect(redactor.write("pin again")).toBe("pin again");
    redactor.addSensitiveInput("pin\r");
    expect(redactor.write("pin\r\n")).toBe(redactedInputPlaceholder("pin\r"));
    expect(redactor.flush()).toBe("");
  });

  it("ignores empty sensitive input", () => {
    expect(redact([""], ["output"]).output).toBe("output");
  });
});
