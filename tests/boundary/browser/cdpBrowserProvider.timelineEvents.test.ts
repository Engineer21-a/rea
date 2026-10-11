import { describe, expect, it } from "vitest";

import { CdpBrowserProvider } from "../../../src/browser/CdpBrowserProvider.js";
import { observeWebSessionInputSchema } from "../../../src/domain/browserSession.js";
import { startFakeCdpBrowser } from "../../fixtures/fakeCdpBrowser.js";
import { trackBrowser } from "./cdpBrowserProvider.support.js";

describe("CdpBrowserProvider navigation timeline", () => {
  it("returns every event beyond the former default collection cap", async () => {
    const additionalEvents = 2_001;
    const browser = await startFakeCdpBrowser({
      pageScopedVersionWebSocket: true,
      omitTargetWebSocket: true,
      sessionTimeline: "same_origin",
      sessionTimelineEventCount: additionalEvents,
    });
    trackBrowser(browser);

    const result = await new CdpBrowserProvider().observeSession(
      observeWebSessionInputSchema.parse({
        cdp_endpoint: browser.endpoint,
        allowed_origins: [browser.allowedOrigin],
        target_id: "allowed-page",
        observation_ms: 1,
      }),
    );

    if (!result.ok) throw result.error;
    expect(result.value.timeline).toHaveLength(additionalEvents + 6);
    expect(result.value.completeness.truncated_sections).not.toContain(
      "timeline",
    );
  });

  it("keeps a window beyond the 32-bit timer range open", async () => {
    const browser = await startFakeCdpBrowser();
    trackBrowser(browser);
    const controller = new AbortController();

    const result = await new CdpBrowserProvider().observeSession(
      observeWebSessionInputSchema.parse({
        cdp_endpoint: browser.endpoint,
        allowed_origins: [browser.allowedOrigin],
        target_id: "allowed-page",
        observation_ms: 3_000_000_000,
      }),
      {
        signal: controller.signal,
        progress: {
          report(update) {
            if (update.completed === 1)
              setTimeout(() => controller.abort(), 100);
            return Promise.resolve();
          },
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        _tag: "AnalysisCancelledError",
        operation: "observe_web_session",
      },
    });
  });
});
