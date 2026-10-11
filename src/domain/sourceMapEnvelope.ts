/**
 * Structural walk over indexed source-map envelopes for the artifact
 * source-map reader: version-3 maps with recursively indexed `sections`,
 * flattened into leaves in declared depth-first order. Leaf content checks
 * (mappings, sources, names, contents) stay with the caller. The browser
 * source-map fetcher's SourceMapFormat keeps a separate strict validator
 * that also checks section offsets and URLs.
 */
type SourceMapRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is SourceMapRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a parsed value has the version-3 map shape. */
export const isVersion3Map = (value: unknown): value is SourceMapRecord =>
  isRecord(value) && value.version === 3;

/**
 * Collect leaf maps from an indexed source-map envelope, or undefined when
 * the envelope is not a version-3 map. Leaves follow declared section order,
 * depth first. A map carrying neither `mappings` nor `sections` yields itself
 * as the single leaf; callers decide whether that leaf is valid content.
 */
export const flattenSourceMapLeaves = (
  root: unknown,
): readonly SourceMapRecord[] | undefined => {
  if (!isVersion3Map(root)) return undefined;
  const leaves: SourceMapRecord[] = [];
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const map = pending.pop();
    if (!isVersion3Map(map)) return undefined;
    if (Array.isArray(map.sections)) {
      const sectionMaps: SourceMapRecord[] = [];
      for (const section of map.sections) {
        if (!isRecord(section) || !isRecord(section.map)) return undefined;
        sectionMaps.push(section.map);
      }
      // Push in reverse so the LIFO stack pops sections in declared order.
      for (let index = sectionMaps.length - 1; index >= 0; index -= 1)
        pending.push(sectionMaps[index]);
    } else leaves.push(map);
  }
  return leaves;
};
