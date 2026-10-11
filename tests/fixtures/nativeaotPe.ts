import { createHash } from "node:crypto";

const IMAGE_BASE = 0x140000000n;
const address = (rva: number): bigint => IMAGE_BASE + BigInt(rva);

export const nativeAotPeDigest = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

type ExtraMethodTable = {
  readonly rva: number;
  readonly related: bigint;
  readonly interfaces: readonly bigint[];
};

const buildNativeAotPe = (
  major: number,
  minor: number,
  rdataBytes: number,
  extraTables: readonly ExtraMethodTable[],
): Buffer => {
  const bytes = Buffer.alloc(0x600 + rdataBytes);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write("PE\0\0", 0x80, "ascii");
  bytes.writeUInt16LE(0x8664, 0x84);
  bytes.writeUInt16LE(2, 0x86);
  bytes.writeUInt16LE(0xf0, 0x94);
  const optional = 0x98;
  bytes.writeUInt16LE(0x20b, optional);
  bytes.writeBigUInt64LE(IMAGE_BASE, optional + 24);
  bytes.writeUInt32LE(
    0x2000 + Math.ceil(rdataBytes / 0x1000) * 0x1000,
    optional + 56,
  );
  bytes.writeUInt32LE(0x400, optional + 60);
  const sectionTable = optional + 0xf0;
  bytes.write(".text", sectionTable, "ascii");
  bytes.writeUInt32LE(0x200, sectionTable + 8);
  bytes.writeUInt32LE(0x1000, sectionTable + 12);
  bytes.writeUInt32LE(0x200, sectionTable + 16);
  bytes.writeUInt32LE(0x400, sectionTable + 20);
  bytes.writeUInt32LE(0x60000020, sectionTable + 36);
  const data = sectionTable + 40;
  bytes.write(".rdata", data, "ascii");
  bytes.writeUInt32LE(rdataBytes, data + 8);
  bytes.writeUInt32LE(0x2000, data + 12);
  bytes.writeUInt32LE(rdataBytes, data + 16);
  bytes.writeUInt32LE(0x600, data + 20);
  bytes.writeUInt32LE(0x40000040, data + 36);

  bytes.writeUInt8(0xc3, 0x410);
  bytes.writeUInt8(0xc3, 0x420);
  bytes.writeUInt8(0xc3, 0x430);
  const header = 0x600;
  bytes.writeUInt32LE(0x00525452, header);
  bytes.writeUInt16LE(major, header + 4);
  bytes.writeUInt16LE(minor, header + 6);
  bytes.writeUInt16LE(2, header + 12);
  bytes.writeUInt8(24, header + 14);
  bytes.writeUInt8(1, header + 15);
  bytes.writeUInt32LE(207, header + 16);
  bytes.writeUInt32LE(1, header + 20);
  bytes.writeBigUInt64LE(address(0x2100), header + 24);
  bytes.writeBigUInt64LE(address(0x2105), header + 32);
  bytes.writeUInt32LE(206, header + 40);
  bytes.writeBigUInt64LE(address(0x2300), header + 48);
  bytes.writeBigUInt64LE(address(0x2380), header + 56);
  bytes.writeInt32LE(0x280, 0x700);
  bytes.writeUInt8(0x09, 0x704);

  const writeMethodTable = (
    rva: number,
    flags: number,
    baseSize: number,
    related: bigint,
    slots: readonly bigint[],
  ) => {
    const offset = 0x600 + rva - 0x2000;
    bytes.writeUInt32LE(flags, offset);
    bytes.writeUInt32LE(baseSize, offset + 4);
    bytes.writeBigUInt64LE(related, offset + 8);
    bytes.writeUInt16LE(slots.length, offset + 16);
    bytes.writeUInt16LE(0, offset + 18);
    bytes.writeUInt32LE(0x1234, offset + 20);
    slots.forEach((slot, index) =>
      bytes.writeBigUInt64LE(slot, offset + 24 + index * 8),
    );
  };
  const object = address(0x2200);
  writeMethodTable(0x2200, 0x50000000, 0x18, 0n, [
    address(0x1010),
    address(0x1020),
    address(0x1030),
  ]);
  writeMethodTable(0x2280, 0x50000000, 0x20, object, [address(0x1040)]);
  writeMethodTable(0x22c0, 0x50000000, 0x16, object, []);

  const frozen = 0x600 + 0x2300 - 0x2000;
  bytes.writeBigUInt64LE(address(0x22c0), frozen);
  const value = Buffer.from("REA_NATIVEAOT_FROZEN", "utf16le");
  bytes.writeUInt32LE(value.length / 2, frozen + 8);
  value.copy(bytes, frozen + 12);
  bytes.writeUInt16LE(0, frozen + 12 + value.length);
  for (const table of extraTables) {
    writeMethodTable(table.rva, 0x50000000, 0x18, table.related, []);
    const offset = 0x600 + table.rva - 0x2000;
    bytes.writeUInt16LE(table.interfaces.length, offset + 18);
    table.interfaces.forEach((iface, index) =>
      bytes.writeBigUInt64LE(iface, offset + 24 + index * 8),
    );
  }
  return bytes;
};

export const nativeAotPeFixture = (major = 9, minor = 1): Buffer =>
  buildNativeAotPe(major, minor, 0x400, []);

/**
 * The base fixture plus `subclasses` MethodTables at RVA 0x2400 (0x20 apart).
 * Most derive directly from System.Object; some form chains (including a child
 * placed before its base), some reach interface-only tables, and some name a
 * base outside the candidate set and therefore stay outside the closure.
 */
export const nativeAotPeInheritanceFixture = (
  subclasses: number,
): {
  readonly bytes: Buffer;
  readonly includedAddresses: readonly string[];
  readonly excludedAddresses: readonly string[];
} => {
  const stride = 0x20;
  const interfaceBase = 0x2400 + subclasses * stride;
  const interfaceCount = Math.ceil(subclasses / 100) + 1;
  const rdataEnd = interfaceBase + interfaceCount * stride;
  const rdataBytes = Math.ceil((rdataEnd - 0x2000) / 0x200) * 0x200;
  const object = address(0x2200);
  const tableAddress = (index: number) => address(0x2400 + index * stride);
  const interfaceAddress = (index: number) =>
    address(interfaceBase + index * stride);
  const hex = (value: bigint) => `0x${value.toString(16)}`;
  const extraTables: ExtraMethodTable[] = [];
  const included = [object, address(0x2280), address(0x22c0)];
  const excluded: bigint[] = [];
  for (let index = 0; index < subclasses; index++) {
    const phase = index % 10;
    const orphan = index % 50 === 49;
    const related = orphan
      ? address(0x1000)
      : phase >= 1 && phase <= 3
        ? tableAddress(index - 1)
        : phase === 5 && index + 1 < subclasses
          ? tableAddress(index + 1)
          : object;
    const interfaces =
      index % 100 === 7 ? [interfaceAddress(Math.floor(index / 100))] : [];
    extraTables.push({ rva: 0x2400 + index * stride, related, interfaces });
    (orphan ? excluded : included).push(tableAddress(index));
  }
  for (let index = 0; index < interfaceCount; index++) {
    extraTables.push({
      rva: interfaceBase + index * stride,
      related: 0n,
      interfaces: [],
    });
    const referenced = index * 100 + 7 < subclasses;
    (referenced ? included : excluded).push(interfaceAddress(index));
  }
  return {
    bytes: buildNativeAotPe(9, 1, rdataBytes, extraTables),
    includedAddresses: included.map(hex),
    excludedAddresses: excluded.map(hex),
  };
};
