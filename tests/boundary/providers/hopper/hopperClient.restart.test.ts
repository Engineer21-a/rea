import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { BridgeSession } from "../../../../src/hopper/BridgeLauncher.js";
import { HopperClient } from "../../../../src/hopper/HopperClient.js";

import {
  HopperFixtureLauncher as FixtureLauncher,
  startHopperFixtureClient as startClient,
  trackHopperClient,
} from "./hopperClient.fixture.js";

/** Holds every launch until the test opens the gate, keeping startup pending. */
class GatedFixtureLauncher extends FixtureLauncher {
  launches = 0;
  #open: () => void = () => undefined;
  readonly #gate = new Promise<void>((resolve) => {
    this.#open = resolve;
  });

  override async launch(session: BridgeSession) {
    this.launches += 1;
    await this.#gate;
    return super.launch(session);
  }

  open(): void {
    this.#open();
  }
}

describe("HopperClient restart", () => {
  it("does not finish startup after an immediate close", async () => {
    const client = new HopperClient({
      launcher: new FixtureLauncher(),
      startupTimeoutMs: 1_000,
    });
    onTestFinished(async () => {
      await client.close();
    });

    const starting = client.start();
    await client.close();

    const result = await starting;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error._tag).toBe("HopperCancelledError");
  });

  it("starts a fresh session after close completes", async () => {
    const client = await startClient();
    await client.close();

    await expect(client.start()).resolves.toEqual({
      ok: true,
      value: { name: "REA Hopper bridge", version: "1.0.0" },
    });
  });

  it("serializes a restart requested while close is in progress", async () => {
    const client = await startClient();
    const closing = client.close();
    const restarting = client.start();

    await closing;
    await expect(restarting).resolves.toEqual({
      ok: true,
      value: { name: "REA Hopper bridge", version: "1.0.0" },
    });
    await expect(client.callTool("echo", { value: "fresh" })).resolves.toEqual({
      ok: true,
      value: { value: "fresh" },
    });
  });

  it("keeps a shared startup for a joined caller that did not cancel", async () => {
    const launcher = new GatedFixtureLauncher();
    const client = trackHopperClient(
      new HopperClient({ launcher, startupTimeoutMs: 10_000 }),
    );
    onTestFinished(() => {
      launcher.open();
    });
    const first = new AbortController();
    const cancelled = client.callTool(
      "echo",
      { value: "first" },
      { signal: first.signal },
    );
    const joined = client.callTool("echo", { value: "joined" });
    await vi.waitFor(() => {
      expect(launcher.launches).toBe(1);
    });

    first.abort();
    await expect(cancelled).resolves.toMatchObject({
      ok: false,
      error: { _tag: "HopperCancelledError" },
    });
    launcher.open();

    await expect(joined).resolves.toEqual({
      ok: true,
      value: { value: "joined" },
    });
    expect(launcher.launches).toBe(1);
  });

  it("relaunches for a caller that joins after every earlier caller cancelled", async () => {
    const launcher = new GatedFixtureLauncher();
    const client = trackHopperClient(
      new HopperClient({ launcher, startupTimeoutMs: 10_000 }),
    );
    onTestFinished(() => {
      launcher.open();
    });
    const first = new AbortController();
    const cancelled = client.start(first.signal);
    await vi.waitFor(() => {
      expect(launcher.launches).toBe(1);
    });

    first.abort();
    const joined = client.start();
    launcher.open();

    await expect(cancelled).resolves.toMatchObject({
      ok: false,
      error: { _tag: "HopperCancelledError" },
    });
    await expect(joined).resolves.toEqual({
      ok: true,
      value: { name: "REA Hopper bridge", version: "1.0.0" },
    });
    expect(launcher.launches).toBe(2);
    const abandoned = launcher.processes[0];
    expect(
      abandoned !== undefined &&
        (abandoned.exitCode !== null || abandoned.signalCode !== null),
    ).toBe(true);
  });
});
