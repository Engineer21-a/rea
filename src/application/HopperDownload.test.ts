import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { downloadHopperPackage } from "./HopperDownload.js";

const servers: Server[] = [];

const serve = async (
  respond: (response: ServerResponse) => void,
): Promise<string> => {
  const server = createServer((_request, response) => {
    respond(response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/hopper`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

describe("downloadHopperPackage", () => {
  it("completes a body that keeps progressing past the stall interval", async () => {
    const url = await serve((response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      let sent = 0;
      const interval = setInterval(() => {
        response.write(Uint8Array.of(sent));
        sent += 1;
        if (sent === 12) {
          clearInterval(interval);
          response.end();
        }
      }, 25);
    });

    const result = await downloadHopperPackage(url, { stallTimeoutMs: 200 });

    expect(result.ok).toBe(true);
    expect([...result.bytes]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("rejects a stalled body as a timeout rather than a cancellation", async () => {
    const url = await serve((response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.write(Uint8Array.of(1));
    });

    await expect(
      downloadHopperPackage(url, { stallTimeoutMs: 100 }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("keeps caller cancellation distinct from the stall timeout", async () => {
    const caller = new AbortController();
    const url = await serve((response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.write(Uint8Array.of(1), () => {
        caller.abort();
      });
    });

    await expect(
      downloadHopperPackage(url, {
        signal: caller.signal,
        stallTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
