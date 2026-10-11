import { fstatSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  lstat,
  open,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { parseProcessScenario } from "../../domain/process/processScenario.js";
import { createTestTempDirectory } from "../../../tests/fixtures/temporaryDirectory.js";
import { hashFile, snapshotRoots } from "./FilesystemSnapshot.js";

// Concurrent changes by another process are reproduced by running a real
// filesystem change at the exact call that observes the raced entry.
const { races } = vi.hoisted(() => ({
  races: new Map<string, () => Promise<void>>(),
}));

const takeRace = (
  moment: "before-readlink" | "before-opendir" | "after-enumeration",
  path: string,
): (() => Promise<void>) | undefined => {
  const key = `${moment}:${path}`;
  const race = races.get(key);
  races.delete(key);
  return race;
};

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readlink: async (path: string) => {
      await takeRace("before-readlink", path)?.();
      return actual.readlink(path);
    },
    opendir: async (path: string) => {
      await takeRace("before-opendir", path)?.();
      const directory = await actual.opendir(path);
      const afterEnumeration = takeRace("after-enumeration", path);
      if (afterEnumeration === undefined) return directory;
      return {
        async *[Symbol.asyncIterator]() {
          for await (const entry of directory) yield entry;
          await afterEnumeration();
        },
      };
    },
  };
});

afterEach(() => races.clear());

const countOpenDescriptorsFor = async (path: string): Promise<number> => {
  const directory = process.platform === "linux" ? "/proc/self/fd" : "/dev/fd";
  const expected = await lstat(path);
  const descriptors = await readdir(directory);
  const matches = await Promise.all(
    descriptors.map(async (descriptor) => {
      if (!/^\d+$/u.test(descriptor)) return false;
      try {
        const stats = fstatSync(Number(descriptor));
        return stats.dev === expected.dev && stats.ino === expected.ino;
      } catch (cause: unknown) {
        if (cause instanceof Error && "code" in cause && cause.code === "EBADF")
          return false;
        throw cause;
      }
    }),
  );
  return matches.filter(Boolean).length;
};

it("does not hash a replacement file using the earlier path metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rea-snapshot-identity-"));
  const path = join(directory, "observed-file");
  try {
    await writeFile(path, "captured file\n");
    const expected = await lstat(path);
    await rm(path);
    await writeFile(path, "replacement with a different identity and size\n");

    await expect(hashFile(path, expected, 1_000)).resolves.toEqual({
      state: "omitted",
      reason: "file_changed_or_short_read",
      system_code: null,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects a same-size rewrite even when its modification time is restored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rea-snapshot-ctime-"));
  const path = join(directory, "observed-file");
  try {
    const fixedMtime = new Date("2020-01-02T03:04:05.000Z");
    await writeFile(path, "before\n");
    await utimes(path, fixedMtime, fixedMtime);
    const expected = await lstat(path);
    await expect
      .poll(async () => {
        await writeFile(path, "after!\n");
        await utimes(path, fixedMtime, fixedMtime);
        return (await lstat(path)).ctimeMs;
      })
      .not.toBe(expected.ctimeMs);
    const rewritten = await lstat(path);

    expect(rewritten).toMatchObject({
      dev: expected.dev,
      ino: expected.ino,
      mode: expected.mode,
      size: expected.size,
      mtimeMs: expected.mtimeMs,
    });
    expect(rewritten.ctimeMs).not.toBe(expected.ctimeMs);

    await expect(hashFile(path, expected, 1_000)).resolves.toMatchObject({
      state: "omitted",
      reason: "file_changed_or_short_read",
      system_code: null,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("reports a file removed between metadata observation and open", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rea-snapshot-open-race-"));
  const path = join(directory, "observed-file");
  try {
    await writeFile(path, "captured file\n");
    const expected = await lstat(path);
    await rm(path);

    await expect(hashFile(path, expected, 1_000)).resolves.toEqual({
      state: "omitted",
      reason: "file_unavailable",
      system_code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects cancellation for an empty file before returning its digest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rea-snapshot-empty-cancel-"));
  const path = join(directory, "observed-file");
  try {
    await writeFile(path, "");
    const expected = await lstat(path);
    const controller = new AbortController();
    controller.abort();

    await expect(
      hashFile(path, expected, 1_000, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "closes the opened file when cancellation arrives during open",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "rea-snapshot-cancel-"));
    const path = join(directory, "observed-file");
    try {
      await writeFile(path, "captured file\n");
      const expected = await lstat(path);
      const controller = new AbortController();
      const held = await open(path, "r");
      expect(await countOpenDescriptorsFor(path)).toBe(1);
      await held.close();
      expect(await countOpenDescriptorsFor(path)).toBe(0);
      const hashing = hashFile(path, expected, 1_000, controller.signal);
      // hashFile reaches `open` synchronously before its first suspension, so
      // this abort is observed after the descriptor is acquired and is handled
      // by the `finally` close path.
      const reason = Object.assign(new Error("cancelled while opening"), {
        code: "EACCES",
      });
      controller.abort(reason);

      await expect(hashing).rejects.toBe(reason);
      expect(await countOpenDescriptorsFor(path)).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const snapshotWithRace = async (
  moment: "before-readlink" | "before-opendir" | "after-enumeration",
  setup: (root: string) => Promise<string>,
  race: (path: string) => Promise<void>,
) => {
  const root = await createTestTempDirectory("rea-snapshot-entry-race-");
  await writeFile(join(root, "kept.txt"), "still observed");
  const raced = await setup(root);
  races.set(`${moment}:${raced}`, () => race(raced));
  const snapshot = await snapshotRoots(
    parseProcessScenario({
      executable: process.execPath,
      working_directory: root,
      filesystem_observation_paths: [root],
    }),
  );
  expect(races.size).toBe(0);
  return snapshot;
};

const expectIdentityChangedTruncation = (
  snapshot: Awaited<ReturnType<typeof snapshotRoots>>,
): void => {
  expect(snapshot.truncated).toBe(true);
  expect(snapshot.completeRoots).toEqual([]);
  expect(snapshot.coverage).toMatchObject({
    enumeration_truncated: true,
    enumeration_reasons: ["identity_changed"],
  });
  expect(
    snapshot.files.find(({ path }) => path === "root_0:kept.txt")?.sha256,
  ).not.toBeNull();
};

it.skipIf(process.platform === "win32")(
  "marks a symlink removed before readlink as an identity change",
  async () => {
    const snapshot = await snapshotWithRace(
      "before-readlink",
      async (root) => {
        const path = join(root, ".#lock");
        await symlink("owner@host.1234", path);
        return path;
      },
      (path) => rm(path),
    );
    expectIdentityChangedTruncation(snapshot);
    expect(snapshot.files.map(({ path }) => path)).not.toContain(
      "root_0:.#lock",
    );
  },
);

it.skipIf(process.platform === "win32")(
  "marks a symlink replaced by a regular file before readlink as an identity change",
  async () => {
    const snapshot = await snapshotWithRace(
      "before-readlink",
      async (root) => {
        const path = join(root, "replaced-link");
        await symlink("kept.txt", path);
        return path;
      },
      async (path) => {
        await rm(path);
        await writeFile(path, "no longer a link");
      },
    );
    expectIdentityChangedTruncation(snapshot);
  },
);

it("marks a directory removed before enumeration as an identity change", async () => {
  const snapshot = await snapshotWithRace(
    "before-opendir",
    async (root) => {
      const path = join(root, "cache");
      await mkdir(path);
      await writeFile(join(path, "entry"), "removed with its directory");
      return path;
    },
    (path) => rm(path, { recursive: true }),
  );
  expectIdentityChangedTruncation(snapshot);
  expect(snapshot.files.map(({ path }) => path)).not.toContain(
    "root_0:cache/entry",
  );
});

it("marks a directory removed after enumeration as an identity change", async () => {
  const snapshot = await snapshotWithRace(
    "after-enumeration",
    async (root) => {
      const path = join(root, "cache");
      await mkdir(path);
      await writeFile(join(path, "entry"), "removed with its directory");
      return path;
    },
    (path) => rm(path, { recursive: true }),
  );
  expectIdentityChangedTruncation(snapshot);
  expect(snapshot.files.map(({ path }) => path)).not.toContain(
    "root_0:cache/entry",
  );
});
