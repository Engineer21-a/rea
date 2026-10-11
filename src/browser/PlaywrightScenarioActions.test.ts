import type { Page } from "playwright-core";
import { expect, it, vi } from "vitest";

import { browserScenarioActionSchema } from "../domain/browserScenarioValues.js";
import type { BrowserScenarioSecrets } from "./BrowserScenarioSecrets.js";
import { performPlaywrightScenarioAction } from "./PlaywrightScenarioActions.js";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

const fakePage = () => {
  const click = vi.fn(async () => {});
  const waitForTimeout = vi.fn(async () => {});
  const page = {
    getByTestId: vi.fn(() => ({ click })),
    waitForTimeout,
  } as unknown as Page;
  return { page, click, waitForTimeout };
};

const secrets = {} as BrowserScenarioSecrets;

it("splits a wait beyond the 32-bit timer range into bounded Playwright waits", async () => {
  const { page, waitForTimeout } = fakePage();
  const action = browserScenarioActionSchema.parse({
    step_id: "wait",
    action: "wait_for_timeout",
    duration_ms: 5_000_000_000,
  });

  await performPlaywrightScenarioAction({ page, action, secrets });

  const chunks = waitForTimeout.mock.calls.map(
    (call: unknown[]) => call[0] as number,
  );
  expect(chunks.every((chunk) => chunk <= MAX_TIMER_DELAY_MS)).toBe(true);
  expect(chunks.reduce((total, chunk) => total + chunk, 0)).toBe(5_000_000_000);
});

it.each([
  [MAX_TIMER_DELAY_MS, { timeout: MAX_TIMER_DELAY_MS }],
  [MAX_TIMER_DELAY_MS + 1, {}],
])(
  "forwards a %d ms action timeout to Playwright only within its timer range",
  async (timeoutMs, expected) => {
    const { page, click } = fakePage();
    const action = browserScenarioActionSchema.parse({
      step_id: "click",
      action: "click",
      locator: { kind: "test_id", value: "submit" },
      timeout_ms: timeoutMs,
    });

    await performPlaywrightScenarioAction({ page, action, secrets });

    expect(click).toHaveBeenCalledWith({
      ...expected,
      button: "left",
      clickCount: 1,
    });
  },
);
