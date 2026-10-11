import { describe, expect, it } from "vitest";

import {
  reconcileCapturedWebScript,
  stableWebResources,
  stableWebScriptKey,
} from "./webInventory.js";
import {
  createWebTextArtifact,
  webTextArtifactSchema,
} from "./webContentArtifact.js";

describe("web content artifacts", () => {
  it("rejects altered content that reuses an artifact digest", () => {
    const artifact = createWebTextArtifact("original", "text/javascript");
    expect(
      webTextArtifactSchema.safeParse({ ...artifact, text: "altered!" })
        .success,
    ).toBe(false);
  });

  it("preserves provider media types longer than the former field ceiling", () => {
    const mediaType = `application/${"x".repeat(300)}`;
    const artifact = createWebTextArtifact("content", mediaType);

    expect(webTextArtifactSchema.parse(artifact).media_type).toBe(mediaType);
  });
});

describe("stable web inventory", () => {
  const script = {
    url: "https://app.example.test/assets/app.js",
    cdp_hash: "stable-cdp-hash",
    length: 1_024,
    is_module: true,
    language: "JavaScript",
    source_map_url: "https://app.example.test/assets/app.js.map",
  };

  it("excludes transient CDP and target identity from script keys", () => {
    const first = {
      ...script,
      script_id: "session-one-script",
      target_id: "tab-one",
      capture_id: "capture-one",
    };
    const second = {
      ...script,
      script_id: "session-two-script",
      target_id: "tab-two",
      capture_id: "capture-two",
    };
    expect(stableWebScriptKey(first)).toBe(stableWebScriptKey(second));
    expect(stableWebScriptKey({ ...script, length: 1_025 })).not.toBe(
      stableWebScriptKey(script),
    );
  });

  it("sorts resources deterministically and reconciles only exact URLs", () => {
    const inputs = [
      {
        url: "https://app.example.test/assets/vendor.js",
        origin: "https://app.example.test",
        type: "Script",
        mime_type: "text/javascript",
        content_size: 200,
        rawUrl: "https://app.example.test/assets/vendor.js",
      },
      {
        url: script.url,
        origin: "https://app.example.test",
        type: "Script",
        mime_type: "text/javascript",
        content_size: 1_024,
        rawUrl: script.url,
      },
    ];
    const publicInputs = inputs.map(
      ({ rawUrl: _rawUrl, ...resource }) => resource,
    );
    const forward = stableWebResources([
      ...publicInputs,
      ...publicInputs.slice(0, 1),
    ]);
    const reverse = stableWebResources([...publicInputs].reverse());

    expect(reverse).toEqual(forward);
    expect(
      reconcileCapturedWebScript(
        { ...script, rawUrl: script.url },
        inputs,
        forward,
      ),
    ).toEqual({
      status: "exact",
      resource_key: forward.find(({ url }) => url === script.url)?.resource_key,
    });
    const versioned = `${script.url}?v=2`;
    expect(
      reconcileCapturedWebScript(
        { ...script, url: versioned, rawUrl: versioned },
        inputs,
        forward,
      ),
    ).toEqual({ status: "unmatched", reason: "no_exact_sanitized_url" });
  });

  it("reports duplicate sanitized observations without a unique raw match as ambiguous", () => {
    const duplicate = {
      url: script.url,
      origin: "https://app.example.test",
      type: "Script",
      mime_type: "text/javascript",
      content_size: 1_024,
      rawUrl: `${script.url}?token=one`,
    };
    const rawResources = [
      duplicate,
      { ...duplicate, content_size: 2_048, rawUrl: `${script.url}?token=two` },
    ];
    const resources = stableWebResources(
      rawResources.map(({ rawUrl: _rawUrl, ...resource }) => resource),
    );
    const expected = {
      status: "ambiguous",
      candidate_resource_keys: resources
        .map(({ resource_key }) => resource_key)
        .sort(),
    };

    expect(
      reconcileCapturedWebScript(
        { ...script, rawUrl: `${script.url}?token=three` },
        rawResources,
        resources,
      ),
    ).toEqual(expected);
    expect(
      reconcileCapturedWebScript(
        { ...script, rawUrl: `${script.url}?token=one` },
        [duplicate, duplicate],
        resources,
      ),
    ).toEqual(expected);
  });

  it("reconciles raw URLs independently of stable inventory sort order", () => {
    const app = {
      url: script.url,
      origin: "https://app.example.test",
      type: "Script",
      mime_type: "text/javascript",
      content_size: 1_024,
      rawUrl: `${script.url}?token=secret`,
    };
    const vendor = {
      url: "https://app.example.test/assets/vendor.js",
      origin: "https://app.example.test",
      type: "Script",
      mime_type: "text/javascript",
      content_size: 2_048,
      rawUrl: "https://app.example.test/assets/vendor.js?v=1",
    };

    for (const rawResources of [
      [app, vendor],
      [vendor, app],
    ]) {
      const resources = stableWebResources(
        rawResources.map(({ rawUrl: _rawUrl, ...resource }) => resource),
      );
      expect(
        reconcileCapturedWebScript(
          { ...script, rawUrl: app.rawUrl },
          rawResources,
          resources,
        ),
      ).toEqual({
        status: "exact",
        resource_key: resources.find(({ url }) => url === script.url)
          ?.resource_key,
      });
    }
  });
});
