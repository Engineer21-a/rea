import { parse } from "plist";

/** The dictionary key REA results cannot carry: validation strips it. */
const PROTOTYPE_KEY = "__proto__";

/** A decoded plist without `__proto__` entries, and how many were omitted. */
export interface PropertyListWithoutPrototypeKeys {
  readonly value: unknown;
  readonly omittedPrototypeKeys: number;
}

/** Limitation for results whose source plist held `__proto__` entries. */
export const omittedPrototypeKeysLimitation = (count: number | null): string =>
  count === null
    ? "Dictionary entries keyed __proto__ were omitted because REA results cannot represent that key."
    : `${String(count)} dictionary ${count === 1 ? "entry" : "entries"} keyed __proto__ ${count === 1 ? "was" : "were"} omitted because REA results cannot represent that key.`;

const withoutKey = (
  value: unknown,
  key: string,
): PropertyListWithoutPrototypeKeys => {
  let omitted = 0;
  const strip = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(strip);
    if (
      item === null ||
      typeof item !== "object" ||
      item instanceof Date ||
      item instanceof Uint8Array
    )
      return item;
    return Object.fromEntries(
      Object.entries(item).flatMap(([name, entry]) => {
        if (name !== key) return [[name, strip(entry)]];
        omitted += 1;
        return [];
      }),
    );
  };
  const stripped = strip(value);
  return { value: stripped, omittedPrototypeKeys: omitted };
};

/** Remove own `__proto__` entries, such as JSON.parse creates, and count them. */
export const omitPrototypeKeys = (
  value: unknown,
): PropertyListWithoutPrototypeKeys => withoutKey(value, PROTOTYPE_KEY);

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

/**
 * Expand XML character and predefined entity references. A reference beyond
 * Unicode stays as written: comments and CDATA may hold such text literally,
 * and the XML decoder rejects it anywhere else.
 */
export const decodeXmlText = (text: string): string =>
  text.replace(
    /&(?:#x([\da-f]+)|#(\d+)|([a-z]+));/giu,
    (entity, hex?: string, decimal?: string, name?: string) => {
      const codePoint =
        hex !== undefined
          ? parseInt(hex, 16)
          : decimal !== undefined
            ? parseInt(decimal, 10)
            : undefined;
      if (codePoint !== undefined)
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      return (name === undefined ? undefined : XML_ENTITIES[name]) ?? entity;
    },
  );

/**
 * Replace each element key spelling `__proto__` with `replacement`. Tokens
 * match leftmost first, trying a comment, a CDATA section, `<key>text</key>`
 * and `<key><![CDATA[text]]></key>` in that order; comment and CDATA text is
 * copied whole so only element keys match. Starts advance monotonically, so a
 * terminator missing after one start is missing after every later one; that
 * outcome is remembered, keeping the scan linear on unterminated input.
 */
const substitutePrototypeKeys = (text: string, replacement: string): string => {
  const unterminated = new Set<string>();
  const find = (terminator: string, from: number): number => {
    if (unterminated.has(terminator)) return -1;
    const index = text.indexOf(terminator, from);
    if (index < 0) unterminated.add(terminator);
    return index;
  };
  const parts: string[] = [];
  let copied = 0;
  let position = 0;
  for (;;) {
    const start = text.indexOf("<", position);
    if (start < 0) break;
    let end = -1;
    let substitute = false;
    if (text.startsWith("<!--", start)) {
      const close = find("-->", start + 4);
      if (close >= 0) end = close + 3;
    } else if (text.startsWith("<![CDATA[", start)) {
      const close = find("]]>", start + 9);
      if (close >= 0) end = close + 3;
    } else if (text.startsWith("<key>", start)) {
      const next = text.indexOf("<", start + 5);
      if (next >= 0 && text.startsWith("</key>", next)) {
        end = next + 6;
        substitute =
          decodeXmlText(text.slice(start + 5, next)) === PROTOTYPE_KEY;
      } else if (text.startsWith("<![CDATA[", start + 5)) {
        const close = find("]]></key>", start + 14);
        if (close >= 0) {
          end = close + 9;
          substitute = text.slice(start + 14, close) === PROTOTYPE_KEY;
        }
      }
    }
    if (end < 0) {
      position = start + 1;
      continue;
    }
    if (substitute) {
      parts.push(text.slice(copied, start), replacement);
      copied = end;
    }
    position = end;
  }
  parts.push(text.slice(copied));
  return parts.join("");
};

/**
 * Decode an XML plist whose dictionaries may use the legal key `__proto__`,
 * which the `plist` decoder rejects outright. Those entries are omitted and
 * counted so callers can report them instead of failing the whole document.
 */
export const parseXmlPropertyList = (
  text: string,
): PropertyListWithoutPrototypeKeys => {
  // The decoded text holds every key the decoder can produce, including
  // entity-encoded spellings of the placeholder, so no source key aliases it.
  // Decoding comment or CDATA text too can only lengthen the placeholder.
  const decoded = decodeXmlText(text);
  let placeholder = "__rea_prototype_key__";
  while (decoded.includes(placeholder)) placeholder = `_${placeholder}`;
  return withoutKey(
    parse(substitutePrototypeKeys(text, `<key>${placeholder}</key>`)),
    placeholder,
  );
};
