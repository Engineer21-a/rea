import * as t from "@babel/types";

import { sanitizeEndpointCandidate } from "../browserObservation.js";
import {
  addFindingOnce,
  addLocatedFinding,
} from "./javascriptStaticAnalysisFindings.js";
import {
  STATIC_ROUTE_CALL_NAMES,
  argumentValue,
  calleeName,
  createSourceLineIndex,
  endpointArgument as endpointArgumentHelper,
  prefixedArgument,
  range,
  sourceSlice,
  type SourceLineIndex,
  staticPath,
  staticPathResolutionContext,
  storageKind,
  stringValue,
} from "./javascriptStaticAnalysisHelpers.js";
import { semanticStaticPropertyName } from "./javascriptAstValues.js";
import type {
  JavaScriptAnalysisAccumulator as AnalysisAccumulator,
  JavaScriptEndpointInput as EndpointInput,
  JavaScriptFindingContext as FindingContext,
  JavaScriptReferenceInput as ReferenceInput,
} from "./javascriptStaticAnalysisState.js";

type JavaScriptCallLike =
  | t.CallExpression
  | t.OptionalCallExpression
  | t.NewExpression;

/** Inspect one call or new expression for references, endpoints, storage, and roles. */
export const inspectCall = (
  source: string,
  node: JavaScriptCallLike,
  context: FindingContext,
): void => {
  const { accumulator } = context;
  const name = calleeName(node.callee);
  const first = stringValue(node.arguments[0]);
  const module = context.accumulator.moduleRangeIndex.find(node.start);
  const moduleRequireName = module?.requireName ?? null;
  const requireCall = requireCallSpecifier(node, name, moduleRequireName);
  if (requireCall !== null)
    addReference(context, {
      node,
      kind: "require",
      specifier: requireCall.specifier,
    });
  const chunkLoad = chunkLoadSpecifier(node, name, moduleRequireName);
  if (chunkLoad !== null)
    addReference(context, {
      node,
      kind: "dynamic-import",
      specifier: chunkLoad.specifier,
    });
  for (const specifier of vitePreloadDependencySpecifiers(
    source,
    node,
    name,
    accumulator,
  ))
    addReference(context, { node, kind: "dynamic-import", specifier });
  if (name === "Worker" || name.endsWith(".Worker"))
    addReference(context, { node, kind: "worker", specifier: first });
  if (name.endsWith("serviceWorker.register"))
    addReference(context, { node, kind: "service-worker", specifier: first });
  inspectEndpointCall(node, name, first, context);
  inspectStorageCall(node, name, first, context);
  if (first === "audio" || first === "video")
    noteMediaElementPreloads(node, accumulator);
  if (name.endsWith("loadFile") && first !== undefined)
    addLocatedFinding(context, {
      collection: accumulator.roles,
      key: `role\0renderer\0${first}`,
      node,
      value: {
        role: "renderer",
        path: first,
        resolution_context: "filesystem-expression",
        mechanism: `call:${name}`,
        module_key: null,
        location: range(node),
      },
    });
  if (name.endsWith("loadURL") && first !== undefined)
    addLocatedFinding(context, {
      collection: accumulator.roles,
      key: `role\0renderer\0${first}`,
      node,
      value: {
        role: "renderer",
        path: first,
        resolution_context: "module-specifier",
        mechanism: `call:${name}`,
        module_key: null,
        location: range(node),
      },
    });
};

// Element factories such as jsx("audio", props) and createElement("video",
// props) carry the HTML media `preload` hint ("none", "metadata", "auto"),
// which never names an Electron preload script.
const noteMediaElementPreloads = (
  node: JavaScriptCallLike,
  accumulator: AnalysisAccumulator,
): void => {
  const props = node.arguments[1];
  if (!t.isObjectExpression(props)) return;
  for (const property of props.properties)
    if (
      t.isObjectProperty(property) &&
      semanticStaticPropertyName(property.key, property.computed) === "preload"
    )
      accumulator.mediaElementPreloads.add(property);
};

const requireCallSpecifier = (
  node: JavaScriptCallLike,
  name: string,
  moduleRequireName: string | null,
): { readonly specifier: string | undefined } | null => {
  if (name === "require" || name.endsWith(".require"))
    return { specifier: argumentValue(node.arguments[0]) };
  if (name === "__webpack_require__" || name === moduleRequireName)
    return { specifier: argumentValue(node.arguments[0]) };
  if (
    name === "__webpack_require__.bind" ||
    (moduleRequireName !== null && name === `${moduleRequireName}.bind`)
  )
    return { specifier: argumentValue(node.arguments[1]) };
  return null;
};

const chunkLoadSpecifier = (
  node: JavaScriptCallLike,
  name: string,
  moduleRequireName: string | null,
): { readonly specifier: string | undefined } | null => {
  if (
    name !== "__webpack_require__.e" &&
    (moduleRequireName === null || name !== `${moduleRequireName}.e`)
  )
    return null;
  return { specifier: prefixedArgument("chunk:", node.arguments[0]) };
};

const vitePreloadDependencySpecifiers = (
  source: string,
  node: JavaScriptCallLike,
  name: string,
  accumulator: AnalysisAccumulator,
): readonly string[] => {
  if (name !== "__vite__mapDeps" || !t.isArrayExpression(node.arguments[0]))
    return [];
  const indexes = node.arguments[0].elements.flatMap((element) =>
    t.isNumericLiteral(element) ? [element.value] : [],
  );
  if (indexes.length !== node.arguments[0].elements.length) return [];
  accumulator.vitePreloadDependencyTable ??= vitePreloadDependencyTable(source);
  const table = accumulator.vitePreloadDependencyTable;
  return indexes.flatMap((index) => table[index] ?? []);
};

// Each sticky pattern has one deterministic match path whose text holds a
// single occurrence of its leading token, so trying it at every occurrence of
// that token stays linear in the source length.
const VITE_TABLE_GUARD = /\.\s*f\s*\|\|\s*\(/uy;
const VITE_TABLE_ASSIGNMENT = /\.f\s*=\s*\[/uy;
const VITE_TABLE_END = /\]\s*\)/uy;

const stickyMatchEnd = (
  pattern: RegExp,
  source: string,
  index: number,
): number | undefined => {
  pattern.lastIndex = index;
  return pattern.test(source) ? pattern.lastIndex : undefined;
};

/** First `.f = [` assignment at or after `from`, as [start, end after `[`]. */
const nextVitePreloadAssignment = (
  source: string,
  from: number,
): readonly [number, number] => {
  for (
    let start = source.indexOf(".f", from);
    start !== -1;
    start = source.indexOf(".f", start + 1)
  ) {
    const end = stickyMatchEnd(VITE_TABLE_ASSIGNMENT, source, start);
    if (end !== undefined) return [start, end];
  }
  return [-1, -1];
};

/**
 * The leftmost `<x>.f || (<no ")"> .f = [<body>] )` table body, in one
 * left-to-right pass. Guard ends only increase, so the cached next `)` and next
 * assignment are recomputed only past their previous positions.
 */
const vitePreloadDependencyTableBody = (source: string): string | undefined => {
  let close = -2;
  let assignment = -2;
  let bodyStart = -1;
  for (
    let dot = source.indexOf(".");
    dot !== -1;
    dot = source.indexOf(".", dot + 1)
  ) {
    const guardEnd = stickyMatchEnd(VITE_TABLE_GUARD, source, dot);
    if (guardEnd === undefined) continue;
    if (close === -2 || (close !== -1 && close < guardEnd))
      close = source.indexOf(")", guardEnd);
    if (assignment === -2 || (assignment !== -1 && assignment < guardEnd))
      [assignment, bodyStart] = nextVitePreloadAssignment(source, guardEnd);
    // No assignment follows this guard, so none follows any later guard.
    if (assignment === -1) return undefined;
    if (close !== -1 && close < assignment) continue;
    // The body ends at the first `] )`; without one, no later guard matches.
    for (
      let end = source.indexOf("]", bodyStart);
      end !== -1;
      end = source.indexOf("]", end + 1)
    )
      if (stickyMatchEnd(VITE_TABLE_END, source, end) !== undefined)
        return source.slice(bodyStart, end);
    return undefined;
  }
  return undefined;
};

const LINE_TERMINATORS = new Set(["\n", "\r", " ", " "]);

/**
 * Raw contents of single- and double-quoted literals, scanned left to right.
 * A quote that never closes also fails for every later same-type quote before
 * the scan's stopping point, so that span is not rescanned.
 */
const quotedLiteralContents = (body: string): string[] => {
  const literals: string[] = [];
  const failedBefore = new Map<string, number>();
  let index = 0;
  while (index < body.length) {
    const quote = body[index] ?? "";
    if (
      (quote !== '"' && quote !== "'") ||
      index < (failedBefore.get(quote) ?? 0)
    ) {
      index += 1;
      continue;
    }
    let cursor = index + 1;
    let closed = false;
    while (cursor < body.length) {
      const char = body[cursor];
      if (char === quote) {
        closed = true;
        break;
      }
      if (char !== "\\") cursor += 1;
      else if (
        cursor + 1 < body.length &&
        !LINE_TERMINATORS.has(body[cursor + 1] ?? "")
      )
        cursor += 2;
      else break;
    }
    if (closed) {
      literals.push(body.slice(index + 1, cursor));
      index = cursor + 1;
    } else {
      failedBefore.set(quote, cursor);
      index += 1;
    }
  }
  return literals;
};

const vitePreloadDependencyTable = (source: string): readonly string[] => {
  const body = vitePreloadDependencyTableBody(source);
  return body === undefined ? [] : quotedLiteralContents(body);
};

const inspectEndpointCall = (
  node: JavaScriptCallLike,
  name: string,
  first: string | undefined,
  context: FindingContext,
): void => {
  const route = STATIC_ROUTE_CALL_NAMES.some(
    (candidate) => name === candidate || name.endsWith(`.${candidate}`),
  );
  if (route && first !== undefined)
    addEndpoint(context, {
      node,
      kind: "route",
      value: first,
      mechanism: `call:${name}`,
    });
  const receiverFact = context.openReceiverFacts?.get(node.start ?? -1);
  const endpoint = endpointArgumentHelper(
    name,
    node.arguments,
    node.callee,
    receiverFact,
  );
  if (endpoint !== undefined)
    addEndpoint(context, {
      node,
      kind: "network",
      value: endpoint,
      mechanism: `call:${name}`,
    });
};

/** Record tRPC procedures, tRPC link URLs and named GraphQL operations. */
export const inspectRpcNode = (node: t.Node, context: FindingContext): void => {
  const rpc = context.rpcScan.inspect(node);
  if (rpc !== undefined)
    addEndpoint(context, { node, kind: "network", ...rpc });
};

export const inspectRouteProperty = (
  node: t.ObjectProperty,
  context: FindingContext,
): void => {
  const key = semanticStaticPropertyName(node.key, node.computed);
  if ((key === "path" || key === "route") && t.isStringLiteral(node.value))
    addEndpoint(context, {
      node,
      kind: "route",
      value: node.value.value,
      mechanism: `property:${key}`,
    });
};

export const inspectRoleProperty = (
  node: t.ObjectProperty,
  context: FindingContext,
): void => {
  if (semanticStaticPropertyName(node.key, node.computed) !== "preload") return;
  if (context.accumulator.mediaElementPreloads.has(node)) return;
  const path = staticPath(node.value);
  if (path === undefined) return;
  addLocatedFinding(context, {
    collection: context.accumulator.roles,
    key: `role\0preload\0${path}`,
    node,
    value: {
      role: "preload",
      path,
      resolution_context: staticPathResolutionContext(node.value),
      mechanism: "property:preload",
      module_key: null,
      location: range(node),
    },
  });
};

const inspectStorageCall = (
  node: JavaScriptCallLike,
  name: string,
  first: string | undefined,
  context: FindingContext,
): void => {
  const receiverFact = context.openReceiverFacts?.get(node.start ?? -1);
  const storage =
    receiverFact === "local" ||
    receiverFact === "local-indexed-db" ||
    receiverFact === "local-cache-storage"
      ? undefined
      : receiverFact === "indexed-db"
        ? "indexed-db"
        : receiverFact === "cache-storage"
          ? "cache-storage"
          : storageKind(name);
  if (storage === undefined) return;
  addLocatedFinding(context, {
    collection: context.accumulator.storage,
    key: `storage\0${storage}\0${first ?? ""}`,
    node,
    value: {
      kind: storage,
      name: first ?? null,
      mechanism: `call:${name}`,
      module_key: null,
      location: range(node),
    },
  });
};

export const addReference = (
  context: FindingContext,
  input: ReferenceInput,
): void => {
  const specifier = input.specifier ?? null;
  const reference =
    specifier === null
      ? {
          specifier: null,
          expression: sourceSlice(context.source, input.node),
        }
      : { specifier, expression: null };
  addLocatedFinding(context, {
    collection: context.accumulator.references,
    key: `reference\0${input.kind}\0${reference.specifier ?? reference.expression}`,
    node: input.node,
    value: {
      kind: input.kind,
      ...reference,
      module_key: null,
      location: range(input.node),
    },
  });
};

const addEndpoint = (context: FindingContext, input: EndpointInput): void =>
  addLocatedFinding(context, {
    collection: context.accumulator.endpoints,
    key: `endpoint\0${input.kind}\0${input.value}`,
    node: input.node,
    value: {
      kind: input.kind,
      value: sanitizeEndpointCandidate(input.value),
      mechanism: input.mechanism,
      module_key: null,
      location: range(input.node),
    },
  });

export const addSourceMapDirectives = (
  source: string,
  comments: readonly t.Comment[],
  accumulator: AnalysisAccumulator,
): void => {
  // Read real comment tokens only; quoted text can contain identical markers.
  // Keep both current/legacy line annotations and minifier block annotations.
  // Index lines once and only when a new directive needs a location.
  let lines: SourceLineIndex | undefined;
  for (const comment of comments) {
    const start = comment.start;
    const end = comment.end;
    if (
      start === undefined ||
      start === null ||
      end === undefined ||
      end === null
    )
      continue;
    const commentSource = source.slice(start, end);
    if (
      !(commentSource.startsWith("//") || commentSource.startsWith("/*")) ||
      !(commentSource[2] === "#" || commentSource[2] === "@")
    )
      continue;
    // Single-class searches avoid regex backtracking over unbounded whitespace
    // or inline URLs, which can exhaust the engine stack on two-byte strings.
    const nameOffset = commentSource.slice(3).search(/\S/u);
    if (nameOffset === -1) continue;
    const nameStart = 3 + nameOffset;
    if (!commentSource.startsWith("sourceMappingURL", nameStart)) continue;
    const nameEnd = nameStart + "sourceMappingURL".length;
    const equalsOffset = commentSource.slice(nameEnd).search(/\S/u);
    if (equalsOffset === -1) continue;
    const equalsStart = nameEnd + equalsOffset;
    if (!commentSource.startsWith("=", equalsStart)) continue;
    const urlOffset = commentSource.slice(equalsStart + 1).search(/\S/u);
    if (urlOffset === -1) continue;
    const declaredStart = equalsStart + 1 + urlOffset;
    const terminator = commentSource
      .slice(declaredStart)
      .search(commentSource.startsWith("//") ? /\s/u : /[\s*]/u);
    const declaredEnd =
      terminator === -1 ? commentSource.length : declaredStart + terminator;
    if (declaredEnd === declaredStart) continue;
    const declared = commentSource.slice(declaredStart, declaredEnd);
    addFindingOnce(accumulator, `source-map\0${declared}`, () => {
      lines ??= createSourceLineIndex(source);
      accumulator.sourceMaps.push({
        declared_url: declared,
        location: lines.range(start, start + declaredEnd),
      });
    });
  }
};
