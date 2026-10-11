import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { err, ok, type Result } from "./result.js";

/** One caller-supplied argument of a custom MCP prompt. */
export interface CustomPromptArgument {
  readonly description: string;
  readonly required: boolean;
  /** Text rendered when an optional argument is omitted. */
  readonly default?: string;
}

/** A researcher-authored MCP prompt loaded from a Markdown document. */
export interface CustomPromptDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly arguments: Readonly<Record<string, CustomPromptArgument>>;
  readonly template: string;
  /** Document the prompt was read from, for diagnostics. */
  readonly source: string;
}

/** Why one prompt document was not admitted. */
export interface CustomPromptRejection {
  readonly _tag: "CustomPromptRejection";
  readonly source: string;
  readonly reason: string;
}

const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/u;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u;
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/gu;

const identifier = z
  .string()
  .regex(IDENTIFIER, "use lowercase letters, digits and underscores");
const text = z.string().trim().min(1);

const argumentSchema = z
  .object({
    description: text,
    required: z.boolean().default(false),
    default: z.string().optional(),
  })
  .strict()
  .refine(
    (argument) => !(argument.required && argument.default !== undefined),
    "a required argument cannot have a default",
  );

const frontMatterSchema = z
  .object({
    name: identifier,
    title: text,
    description: text,
    arguments: z.record(identifier, argumentSchema).default({}),
  })
  .strict();

const rejection = (source: string, reason: string): CustomPromptRejection => ({
  _tag: "CustomPromptRejection",
  source,
  reason,
});

/**
 * Parse one prompt document: YAML front matter between `---` lines, followed
 * by a Markdown template whose `{{argument}}` placeholders name declared
 * arguments.
 */
export const parseCustomPromptDocument = (
  document: string,
  source: string,
): Result<CustomPromptDefinition, CustomPromptRejection> => {
  const content = document.replace(/^﻿/u, "");
  const match = FRONT_MATTER.exec(content);
  if (match === null)
    return err(
      rejection(source, "missing YAML front matter between --- lines"),
    );
  let metadata: unknown;
  try {
    metadata = parseYaml(match[1] ?? "");
  } catch (cause) {
    return err(
      rejection(
        source,
        `invalid YAML front matter: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
    );
  }
  const parsed = frontMatterSchema.safeParse(metadata);
  if (!parsed.success)
    return err(
      rejection(
        source,
        parsed.error.issues
          .map((issue) =>
            issue.path.length === 0
              ? issue.message
              : `${issue.path.join(".")}: ${issue.message}`,
          )
          .join("; "),
      ),
    );
  const template = content.slice(match[0].length).trim();
  if (template.length === 0)
    return err(
      rejection(source, "the prompt template after the front matter is empty"),
    );
  const declared = new Set(Object.keys(parsed.data.arguments));
  const undeclared = [
    ...new Set(
      [...template.matchAll(PLACEHOLDER)]
        .map((placeholder) => placeholder[1] ?? "")
        .filter((name) => !declared.has(name)),
    ),
  ];
  if (undeclared.length > 0)
    return err(
      rejection(
        source,
        `undeclared placeholders: ${undeclared.map((name) => `{{${name}}}`).join(", ")}`,
      ),
    );
  return ok({
    name: parsed.data.name,
    title: parsed.data.title,
    description: parsed.data.description,
    arguments: Object.fromEntries(
      Object.entries(parsed.data.arguments).map(([name, argument]) => [
        name,
        {
          description: argument.description,
          required: argument.required,
          ...(argument.default === undefined
            ? {}
            : { default: argument.default }),
        },
      ]),
    ),
    template,
    source,
  });
};

/**
 * Render a custom prompt. Declared placeholders receive the caller's value,
 * else the argument default, else an empty string; undeclared caller values
 * are ignored.
 */
export const renderCustomPrompt = (
  definition: CustomPromptDefinition,
  values: Readonly<Record<string, string>>,
): string =>
  definition.template.replace(PLACEHOLDER, (_placeholder, name: string) => {
    const argument = definition.arguments[name];
    const value = values[name];
    return value !== undefined && value.trim().length > 0
      ? value
      : (argument?.default ?? "");
  });
