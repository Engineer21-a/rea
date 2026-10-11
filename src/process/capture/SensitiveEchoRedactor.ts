/** Placeholder persisted in place of one sensitive scripted input value. */
export const redactedInputPlaceholder = (data: string): string =>
  `<redacted-input:${String(Buffer.byteLength(data))}-bytes>`;

interface SensitiveEchoPattern {
  readonly input: string;
  readonly placeholder: string;
  /** One alternative set per input character, longest alternative first. */
  readonly steps: readonly (readonly string[])[];
}

interface EchoMatch {
  /** End offset of the longest complete echo starting at the probed offset. */
  readonly end: number | undefined;
  /** Whether the buffer ends inside an echo form that could still complete. */
  readonly partial: boolean;
}

/**
 * Terminal line-discipline echo forms of one input character: the character
 * itself, CR echoed as a newline under ICRNL/ONLCR, LF echoed as CRLF under
 * ONLCR, and other control characters echoed as `^X` under ECHOCTL.
 */
const echoForms = (character: string): readonly string[] => {
  if (character === "\r") return ["\r\n", "\n", "^M", "\r"];
  if (character === "\n") return ["\r\n", "\n"];
  const code = character.codePointAt(0) ?? 0;
  if ((code < 0x20 && character !== "\t") || code === 0x7f)
    return [`^${String.fromCharCode(code ^ 0x40)}`, character];
  return [character];
};

const matchEcho = (
  pattern: SensitiveEchoPattern,
  text: string,
  start: number,
): EchoMatch => {
  let end: number | undefined;
  let partial = false;
  const visited = new Set<string>();
  const pending: [step: number, offset: number][] = [[0, start]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [step, offset] = next;
    const key = `${String(step)}:${String(offset)}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const alternatives = pattern.steps[step];
    if (alternatives === undefined) {
      end = Math.max(end ?? offset, offset);
      continue;
    }
    const remaining = text.length - offset;
    for (const alternative of alternatives) {
      if (text.startsWith(alternative, offset))
        pending.push([step + 1, offset + alternative.length]);
      else if (
        alternative.length > remaining &&
        alternative.startsWith(text.slice(offset))
      )
        partial = true;
    }
  }
  return { end, partial };
};

/**
 * Streaming redactor owned by one process capture. It replaces terminal echo
 * of sensitive scripted inputs that were already dispatched with the same
 * placeholder the interaction log records, before raw frames or the renderer
 * see the bytes. Output that could still complete an echo form is held back
 * until the next chunk resolves it, so non-matching output is delayed by at
 * most the longest pending match.
 */
export class SensitiveEchoRedactor {
  readonly #patterns: SensitiveEchoPattern[] = [];
  readonly #leadingCharacters = new Set<string>();
  #pending = "";

  /** Register one dispatched sensitive input; call before writing it to the terminal. */
  addSensitiveInput(input: string): void {
    if (input.length === 0) return;
    if (this.#patterns.some((pattern) => pattern.input === input)) return;
    const steps = Array.from(input, echoForms);
    for (const alternative of steps[0] ?? [])
      this.#leadingCharacters.add(alternative.charAt(0));
    this.#patterns.push({
      input,
      placeholder: redactedInputPlaceholder(input),
      steps,
    });
  }

  /** Return the redacted output that no longer depends on future chunks. */
  write(chunk: string): string {
    return this.#scan(this.#pending + chunk, false);
  }

  /** Release held output at the end of the observed stream. */
  flush(): string {
    return this.#scan(this.#pending, true);
  }

  #scan(text: string, final: boolean): string {
    this.#pending = "";
    if (this.#patterns.length === 0) return text;
    let output = "";
    let released = 0;
    let offset = 0;
    while (offset < text.length) {
      if (!this.#leadingCharacters.has(text.charAt(offset))) {
        offset += 1;
        continue;
      }
      let longest: { end: number; placeholder: string } | undefined;
      let partial = false;
      for (const pattern of this.#patterns) {
        const match = matchEcho(pattern, text, offset);
        partial ||= match.partial;
        if (
          match.end !== undefined &&
          (longest === undefined || match.end > longest.end)
        )
          longest = { end: match.end, placeholder: pattern.placeholder };
      }
      if (partial && !final) {
        this.#pending = text.slice(offset);
        return output + text.slice(released, offset);
      }
      if (longest === undefined) {
        offset += 1;
        continue;
      }
      output += text.slice(released, offset) + longest.placeholder;
      offset = longest.end;
      released = offset;
    }
    return output + text.slice(released);
  }
}
