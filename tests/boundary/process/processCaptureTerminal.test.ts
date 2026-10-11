import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { itWithCaptureCapability } from "./processCaptureCapability.js";

import { createProcessCaptureEvidence } from "../../../src/application/process/ProcessEvidence.js";
import { captureProcessScenario } from "../../../src/process/capture/ProcessHarness.js";
import { parseProcessScenario } from "../../../src/domain/process/processScenario.js";

itWithCaptureCapability(
  "captures one command's terminal output, selected files, and owned cleanup",
  async () => {
    const root = await createTestTempDirectory("rea-process-capture-");
    const script = join(root, "task.mjs");
    await writeFile(
      script,
      [
        'import { writeFile } from "node:fs/promises";',
        "process.stdout.write(`value:${process.env.CAPTURE_VALUE}\\n`);",
        'await writeFile("state.txt", "created");',
      ].join("\n"),
    );
    try {
      const result = await captureProcessScenario(
        parseProcessScenario({
          executable: process.execPath,
          arguments: [script],
          working_directory: root,
          environment: { CAPTURE_VALUE: "caller-selected" },
          filesystem_observation_paths: ["."],
        }),
      );
      if (!result.ok) throw result.error;
      expect(result.value.frames.map(({ data }) => data).join("")).toContain(
        "value:caller-selected",
      );
      expect(result.value.files_after).toContainEqual(
        expect.objectContaining({ path: "root_0:state.txt" }),
      );
      expect(result.value.filesystem_effects).toContainEqual(
        expect.objectContaining({
          status: "created",
          path: "root_0:state.txt",
        }),
      );
      expect(result.value.cleanup).toMatchObject({
        owned_process_group: "verified",
        temporary_root: "removed",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  20_000,
);

itWithCaptureCapability(
  "redacts terminal echo of sensitive input sent to a target that never reads it",
  async () => {
    const secret = "pty-echo-secret";
    const scenario = parseProcessScenario({
      executable: process.execPath,
      arguments: ["-e", "setTimeout(() => {}, 1500)"],
      events: [
        { type: "input", at_ms: 200, data: `${secret}\r`, sensitive: true },
      ],
    });
    const result = await captureProcessScenario(scenario);
    if (!result.ok) throw result.error;
    const evidence = createProcessCaptureEvidence(scenario, result.value);

    expect(result.value.frames.map(({ data }) => data).join("")).toContain(
      `<redacted-input:${String(secret.length + 1)}-bytes>`,
    );
    expect(
      result.value.rendered_frames.flatMap(({ lines }) => lines).join("\n"),
    ).toContain("<redacted-input:");
    expect(JSON.stringify(evidence)).not.toContain(secret);
  },
  20_000,
);

itWithCaptureCapability(
  "journals output held for a possible echo before the final filesystem checkpoint",
  async () => {
    // The target's last output is a prefix of the sensitive echo, so the
    // redactor holds it until the end of observation releases it.
    const scenario = parseProcessScenario({
      executable: process.execPath,
      arguments: [
        "-e",
        "setTimeout(() => process.stdout.write('tail:zq'), 600); setTimeout(() => {}, 900)",
      ],
      events: [{ type: "input", at_ms: 100, data: "zqx\r", sensitive: true }],
    });
    const result = await captureProcessScenario(scenario);
    if (!result.ok) throw result.error;
    const { frames, event_journal: journal } = result.value;
    const tail = frames.findIndex(({ data }) => data.endsWith("zq"));
    expect(frames.map(({ data }) => data).join("")).toContain("tail:zq");
    expect(tail).toBeGreaterThanOrEqual(0);
    const orderOf = (collection: string, index: number): number | undefined =>
      journal.find(
        (entry) => entry.collection === collection && entry.index === index,
      )?.capture_order;
    const finalCheckpoint = result.value.filesystem_checkpoints.findIndex(
      ({ name }) => name === "after_settlement",
    );
    expect(orderOf("frames", tail)).toBeLessThan(
      orderOf("filesystem_checkpoints", finalCheckpoint) ?? -1,
    );
  },
  20_000,
);
