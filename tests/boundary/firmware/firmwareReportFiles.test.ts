import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import {
  inventoryFirmwareOutput,
  readFirmwareReport,
} from "../../../src/firmware/FirmwareFiles.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

it.each([
  ["invalid leading byte", [0xff]],
  ["incomplete sequence", [0xe2, 0x82]],
  ["overlong sequence", [0xc0, 0xaf]],
  ["encoded surrogate", [0xed, 0xa0, 0x80]],
])(
  "rejects complete JSON containing %s without repairing producer bytes",
  async (_name, bytes) => {
    const root = await createTestTempDirectory("rea-firmware-report-");
    const path = join(root, "report.json");
    await writeFile(
      path,
      Buffer.concat([
        Buffer.from('{"description":"'),
        Buffer.from(bytes),
        Buffer.from('"}'),
      ]),
    );
    await expect(
      readFirmwareReport(path, "inspect_firmware_regions"),
    ).rejects.toMatchObject({
      _tag: "AnalysisOutputError",
      reason: "Tool report is not valid complete JSON",
    });
  },
);

it("preserves valid Unicode and a literal replacement character in producer JSON", async () => {
  const root = await createTestTempDirectory("rea-firmware-report-");
  const path = join(root, "report.json");
  const report = { description: "固件 🧩 \ufffd", path: "/输入/firmware.bin" };
  await writeFile(path, JSON.stringify(report));
  expect(await readFirmwareReport(path, "inspect_firmware_regions")).toEqual(
    report,
  );
});

it("orders the extraction inventory by Unicode code point, independent of locale", async () => {
  const root = await createTestTempDirectory("rea-firmware-inventory-");
  await mkdir(join(root, "aa"));
  await mkdir(join(root, "z"));
  for (const path of ["B", "a", "aa/lib", "z/bin", "\u00e4.bin"])
    await writeFile(join(root, path), path);
  const entries = await inventoryFirmwareOutput(
    root,
    1024,
    16,
    "extract_firmware",
  );
  expect(entries.map(({ relativePath }) => relativePath)).toEqual([
    "B",
    "a",
    "aa/lib",
    "z/bin",
    "\u00e4.bin",
  ]);
});
