/** Maximum admitted vendor response bytes, shared by Hopper setup adapters. */
export const HOPPER_DOWNLOAD_BYTES = 100_000_000;

/** Inactivity bound for connecting, receiving headers, and each body chunk. */
const HOPPER_DOWNLOAD_STALL_MS = 120_000;

/** Bound observed response bytes before retaining them, including chunked bodies. */
export const downloadHopperPackage = async (
  url: string,
  options: {
    readonly signal?: AbortSignal;
    readonly stallTimeoutMs?: number;
  } = {},
): Promise<{ readonly ok: boolean; readonly bytes: Uint8Array }> => {
  // Progress resets the bound, so slow links that keep delivering bytes complete.
  const stall = new AbortController();
  const stallTimeoutMs = options.stallTimeoutMs ?? HOPPER_DOWNLOAD_STALL_MS;
  let timer: NodeJS.Timeout | undefined;
  const progressed = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stall.abort(new DOMException("Hopper download stalled", "TimeoutError"));
    }, stallTimeoutMs).unref();
  };
  progressed();
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "rea-installer" },
      signal:
        options.signal === undefined
          ? stall.signal
          : AbortSignal.any([options.signal, stall.signal]),
    });
    progressed();
    const refused = { ok: false, bytes: new Uint8Array() };
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > HOPPER_DOWNLOAD_BYTES
    ) {
      await response.body?.cancel();
      return refused;
    }
    if (response.body === null) return { ok: true, bytes: new Uint8Array() };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        progressed();
        if (chunk.done)
          return { ok: true, bytes: Buffer.concat(chunks, bytes) };
        if (chunk.value.byteLength > HOPPER_DOWNLOAD_BYTES - bytes) {
          await reader.cancel();
          return refused;
        }
        chunks.push(chunk.value);
        bytes += chunk.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timer);
  }
};
