# Guided MCP prompts and completion

REA exposes six provider-neutral investigation workflows through the MCP
`prompts` capability. They complement the generated tool catalog; they do not add, remove, or
invoke tools by themselves.

## Prompt inventory

| Prompt                            | Purpose                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `investigate_feature`             | Trace a feature from discovery into relevant function evidence.                      |
| `compare_application_versions`    | Compare two shipped artifacts, with optional static and runtime follow-up.           |
| `verify_reconstruction`           | Evaluate a finite reconstruction specification against retained comparison Evidence. |
| `trace_crash`                     | Correlate a crash symptom with static paths and optional process capture evidence.   |
| `audit_residual_unknowns`         | Audit current residual-unknown heads and evidence-qualified resolution.              |
| `prepare_bounded_process_capture` | Design a bounded controlled process experiment before execution.                     |

Every rendered prompt provides optional starting points using current REA tool
names. Agents can call tools directly, skip irrelevant suggestions, and inspect
provider or target state only when it helps answer the request or a tool
requires it. The prompts also ask agents to keep observations, inferences, and
unknowns distinct. Requested prompt arguments and completion choices are
rendered as untrusted selection data, not instructions or authorization.
Tool results include their Evidence inline. Prompts do not require a bundle or
resource fetch to read a result; an Evidence ID is only a reference when a
prompt argument or tool explicitly accepts one.

For a JavaScript/Electron application directory, `investigate_feature` points
directly to `analyze_javascript_application` with `input_path`; it does not
require `open_binary`. When that Evidence, or `inspect_binary_layout` Evidence,
is already retained, it suggests `inspect_analysis_view` before tracing a
feature seed. The CLI equivalent is `rea analyze <directory>`.
`open_binary` and the doctor target check admit files and macOS app bundles.
A directory outside that opening route is reported with an available analysis
action; this does not establish support for every directory format.

For target paths in `compare_application_versions`, the prompt suggests
opening each target before calling `inspect_artifact`; inspection operates on
the active target and returns the graph and findings together inline.

Use standard MCP discovery and retrieval:

```json
{ "method": "prompts/list", "params": {} }
```

```json
{
  "method": "prompts/get",
  "params": {
    "name": "investigate_feature",
    "arguments": {
      "feature": "offline search",
      "document": "Notes"
    }
  }
}
```

The server advertises `listChanged: true`. Updating a registered guided prompt
emits `notifications/prompts/list_changed`, allowing clients to refresh their
cached prompt catalog.

## Custom prompts

Set `REA_PROMPTS_DIR` to an absolute directory to add your own prompts beside
the guided workflows. REA reads every `*.md` file directly in that directory
at server start, in file-name order. Each file holds YAML front matter and a
Markdown template:

```markdown
---
name: evidence_summary
title: Summarize Evidence
description: Summarize the current findings for a team report.
arguments:
  topic:
    description: Feature or question the summary covers
    required: true
  report_language:
    description: Language of the summary
    default: Deutsch
---

Summarize what the retained Evidence shows about {{topic}}. Separate
observations, inferences and unknowns, and write the summary in
{{report_language}}.
```

- `name` and argument names use lowercase letters, digits and underscores.
- `{{argument}}` placeholders must name declared arguments. An omitted
  optional argument renders its `default`, or nothing.
- A required argument cannot have a default. Clients must supply it.

A document that fails these rules, exceeds 256 KiB, or reuses the name of a
guided workflow or an earlier document is skipped. REA logs the file and the
reason as a warning and registers the remaining documents. Custom prompts
render your template with the argument values verbatim; they do not run tools
by themselves. Restart the MCP server after you change the directory.

Clients that support MCP prompts, such as Claude Code, VS Code and Gemini
CLI, list them with the guided workflows. For a client without prompt
support, paste the rendered Markdown into the conversation instead.

## Session-aware completion

MCP `completion/complete` completes guided-prompt arguments; it does not define
completion for arbitrary tool-call arguments. REA attaches completion to
optional prompt arguments that accept a session value. Suggestions provide
identifiers only; they do not retrieve or replace the inline Evidence result.

```json
{
  "method": "completion/complete",
  "params": {
    "ref": {
      "type": "ref/prompt",
      "name": "investigate_feature"
    },
    "argument": {
      "name": "procedure",
      "value": "0x10"
    },
    "context": {
      "arguments": {
        "document": "Notes"
      }
    }
  }
}
```

Completion sources are live projections of the current session:

| Argument family     | Source and filtering                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document            | Current provider `list_documents` result.                                                                                                            |
| Procedure           | The complete `list_procedures` inventory; all procedure addresses and uniquely named procedures are offered. Optional document context is forwarded. |
| Provider            | `auto` plus sorted deep candidates from the current binary session; target-free completion does not start them.                                      |
| Evidence            | Evidence IDs retained in the current session ledger, offered only for prompt arguments that accept Evidence references.                              |
| Process capture     | IDs for retained Evidence whose operation and validated result identify process capture.                                                             |
| Artifact manifest   | Manifest IDs from schema-valid retained artifact inventories.                                                                                        |
| Artifact occurrence | Occurrence IDs present in schema-valid retained artifact inventory pages.                                                                            |
| Residual unknown    | Current non-resolved unknown heads only.                                                                                                             |

Suggestions are Unicode-normalized, case-insensitive prefix matches. The server
deduplicates them and sorts by code point for deterministic results. Procedure
completion derives candidates from the complete inventory, so a name is offered
only when it identifies one address in that inventory. Completion returns all
matching values; it does not expose paging controls.

## Lifecycle and safety

Completion has no cache in REA. Opening or switching a target changes document
and procedure suggestions on the next request. Closing the binary clears its
Evidence ledger and residual-unknown registry, so identifiers from the closed
session are no longer suggested. Provider errors, unsupported operations, and
malformed provider output produce an empty completion list rather than an
unverified identifier.

Suggestions are starting points, not tool calls. A tool acts on the target,
operation, and lifecycle fields in its own request; selecting a suggestion does
not execute it or broaden those fields.
