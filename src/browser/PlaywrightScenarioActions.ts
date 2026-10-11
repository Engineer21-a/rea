import type { Locator, Page } from "playwright-core";

import type {
  BrowserScenarioAction,
  BrowserScenarioValue,
} from "../domain/browserScenarioValues.js";
import type { BrowserScenarioSecrets } from "./BrowserScenarioSecrets.js";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

type ScenarioLocator = Extract<
  BrowserScenarioAction,
  { readonly locator: unknown }
>["locator"];

const resolveLocator = (page: Page, locator: ScenarioLocator): Locator => {
  switch (locator.kind) {
    case "test_id":
      return page.getByTestId(locator.value);
    case "role":
      return page.getByRole(locator.role, {
        name: locator.name,
        exact: true,
      });
    case "css":
      return page.locator(locator.selector);
  }
};

const resolveValue = (
  value: BrowserScenarioValue,
  secrets: BrowserScenarioSecrets,
): string => secrets.value(value);

interface PerformActionInput {
  readonly page: Page;
  readonly action: BrowserScenarioAction;
  readonly secrets: BrowserScenarioSecrets;
}

/** Execute one admitted declarative action with no caller-supplied code. */
export const performPlaywrightScenarioAction = async (
  input: PerformActionInput,
): Promise<void> => {
  const { page, action, secrets } = input;
  const timeout = "timeout_ms" in action ? action.timeout_ms : undefined;
  // Playwright arms one 32-bit timer that fires at once above this delay.
  // The context default is unbounded and the caller's execution boundary
  // enforces the full timeout_ms with chunked timers.
  const options =
    timeout === undefined || timeout > MAX_TIMER_DELAY_MS ? {} : { timeout };
  switch (action.action) {
    case "goto":
      await page.goto(secrets.url(action.destination), {
        ...options,
        waitUntil: action.wait_until,
      });
      return;
    case "click":
      await resolveLocator(page, action.locator).click({
        ...options,
        button: action.button,
        clickCount: action.click_count,
      });
      return;
    case "fill":
      await resolveLocator(page, action.locator).fill(
        resolveValue(action.value, secrets),
        options,
      );
      return;
    case "press":
      await resolveLocator(page, action.locator).press(action.key, options);
      return;
    case "select_option":
      await resolveLocator(page, action.locator).selectOption(
        resolveValue(action.value, secrets),
        options,
      );
      return;
    case "check":
      await resolveLocator(page, action.locator).check(options);
      return;
    case "uncheck":
      await resolveLocator(page, action.locator).uncheck(options);
      return;
    case "wait_for":
      await resolveLocator(page, action.locator).waitFor({
        ...options,
        state: action.state,
      });
      return;
    case "wait_for_timeout":
      for (let remaining = action.duration_ms; remaining > 0;) {
        const chunk = Math.min(remaining, MAX_TIMER_DELAY_MS);
        await page.waitForTimeout(chunk);
        remaining -= chunk;
      }
  }
};
