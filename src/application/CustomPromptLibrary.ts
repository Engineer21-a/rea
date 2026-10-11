import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  parseCustomPromptDocument,
  type CustomPromptDefinition,
  type CustomPromptRejection,
} from "../domain/customPrompt.js";

/**
 * Documents above this size are rejected: a prompt is rendered whole into the
 * model's context, and a larger file is almost certainly not a prompt.
 */
export const CUSTOM_PROMPT_MAX_BYTES = 256 * 1024;

/** Admitted prompts and the documents that were rejected, with reasons. */
export interface CustomPromptLibrary {
  readonly directory: string;
  readonly prompts: readonly CustomPromptDefinition[];
  readonly rejected: readonly CustomPromptRejection[];
}

const reject = (source: string, reason: string): CustomPromptRejection => ({
  _tag: "CustomPromptRejection",
  source,
  reason,
});

const errorReason = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Load every `*.md` prompt document directly inside `directory`, in file-name
 * order. A failed document is reported and never prevents its peers; a name
 * already taken by a built-in workflow or an earlier document is rejected.
 */
export const loadCustomPromptLibrary = (
  directory: string,
  reservedNames: ReadonlySet<string>,
): CustomPromptLibrary => {
  let names: string[];
  try {
    names = readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  } catch (cause) {
    return {
      directory,
      prompts: [],
      rejected: [
        reject(directory, `cannot read directory: ${errorReason(cause)}`),
      ],
    };
  }
  const prompts: CustomPromptDefinition[] = [];
  const rejected: CustomPromptRejection[] = [];
  const taken = new Set(reservedNames);
  for (const name of names) {
    const path = join(directory, name);
    let document: string;
    try {
      const status = statSync(path);
      if (!status.isFile()) continue;
      if (status.size > CUSTOM_PROMPT_MAX_BYTES) {
        rejected.push(
          reject(path, `larger than ${String(CUSTOM_PROMPT_MAX_BYTES)} bytes`),
        );
        continue;
      }
      document = readFileSync(path, "utf8");
    } catch (cause) {
      rejected.push(reject(path, `cannot read file: ${errorReason(cause)}`));
      continue;
    }
    const parsed = parseCustomPromptDocument(document, path);
    if (!parsed.ok) {
      rejected.push(parsed.error);
      continue;
    }
    if (taken.has(parsed.value.name)) {
      rejected.push(
        reject(path, `prompt name ${parsed.value.name} is already registered`),
      );
      continue;
    }
    taken.add(parsed.value.name);
    prompts.push(parsed.value);
  }
  return { directory, prompts, rejected };
};
