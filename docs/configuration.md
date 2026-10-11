# Configuration reference

REA reads its settings from environment variables. This page lists every
user-facing variable, the values it accepts, its default, and the guide that
explains the workflow around it. REA installs none of the external tools these
variables point to; each one selects a tool or setting you supply.

How REA applies these variables:

- REA snapshots the environment of the process that starts the CLI command or
  the MCP server. Restart a running MCP server to apply a change.
- "Absolute path" means a path that Node's `path.isAbsolute` accepts on the
  host. Where a variable requires one, REA rejects a relative value instead of
  resolving it against the working directory.
- The variables parsed by one shared schema (`src/config/environment.ts`, plus
  the two `REA_MCP_*` settings) are validated at startup. An empty value or a
  value outside the accepted set fails validation with an
  `Invalid REA environment configuration` error that names the setting and the
  violated constraint. Unset the variable to use its default.
- Variables that select an external tool are resolved when the matching
  capability is used or inspected, not at startup. Run `rea doctor --json` or
  the capability's inspect command to check them.
- On Windows, REA matches variable names case-insensitively.

## General and MCP

| Variable                       | Accepted values                                                                                                                                          | Default                                                     | Effect                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_ANALYSIS_PROVIDER`        | `auto`, or a provider ID: lowercase letters, digits and hyphens, starting with a letter. The built-in binary providers are `hopper`, `ghidra` and `ida`. | `auto`                                                      | Standing provider preference for binary sessions. `auto` uses the single available provider that supports the target. An explicit CLI `--provider` or MCP `open_binary.provider_id` overrides it. See [Choose a provider](cli.md#choose-a-provider) and [identity and discovery](mcp-contracts.md#identity-and-discovery). |
| `REA_MCP_MAX_RESPONSE_BYTES`   | Decimal integer of at least 10485760 (10 MiB), within the safe-integer range. Unit: bytes.                                                               | The MCP SDK's stdio receive buffer, 10485760 bytes (10 MiB) | Response budget for MCP tool results; REA reserves 1024 bytes of it for the protocol envelope. Raise it only when the client has a matching receive buffer. See [tool results](mcp-contracts.md#tool-results).                                                                                                             |
| `REA_MCP_INPUT_SCHEMA_PROFILE` | `full` or `compact`                                                                                                                                      | `full`                                                      | `compact` advertises every tool input schema within a 13,312-byte budget, without nested annotation prose, for clients that cap each tool schema's serialized size. Validation still uses the complete schemas. See [compact input schema profile](mcp-contracts.md#compact-input-schema-profile).                         |
| `REA_LOG_LEVEL`                | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`                                                                                             | `info` for the MCP server; `silent` for CLI commands        | Minimum level of REA's structured JSON log, which is written to stderr so protocol and CLI result output on stdout stay valid.                                                                                                                                                                                             |
| `REA_PROMPTS_DIR`              | Absolute directory path                                                                                                                                  | unset                                                       | Registers every valid `*.md` prompt document in that directory as an additional MCP prompt; see [custom prompts](mcp-prompts.md#custom-prompts).                                                                                                                                                                           |

## Native analysis

Hopper, Ghidra, IDA, NativeAOT and ILSpy are bring-your-own tools. See
[Installation and setup](installation.md) for supported versions, the
[Ghidra provider](ghidra-provider.md) and [Windows Ghidra P0](windows-ghidra-p0.md)
guides for Ghidra semantics, and the [IDA provider](ida-provider.md) guide.

### Ghidra

| Variable                        | Accepted values                                                                                                                                                              | Default                                                       | Effect                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHIDRA_INSTALL_DIR`            | Absolute path to the root of an extracted Ghidra 12.1.x release.                                                                                                             | Unset; the Ghidra provider is unavailable                     | Selects the Ghidra installation REA starts headlessly. Doctor checks the version and `support/analyzeHeadless`. See [Ghidra](installation.md#ghidra) and [Windows Ghidra P0](windows-ghidra-p0.md).                                                                                                                                      |
| `JAVA_HOME`                     | Absolute path to a JDK root.                                                                                                                                                 | Unset; Java is found on `PATH`                                | Selects the JDK that runs Ghidra (`bin/java` under it) and the Android JADX provider. The JDK must satisfy the Java range declared by the Ghidra installation. See [Ghidra](installation.md#ghidra) and [Android analysis](android-analysis.md#supply-tools).                                                                            |
| `REA_GHIDRA_STARTUP_TIMEOUT_MS` | Positive decimal integer from 1 to 2147483647. Unit: milliseconds.                                                                                                           | 330000                                                        | Deadline for Ghidra import, auto-analysis, bridge and readiness on a new session. A startup failure is returned by the first provider query. See [Ghidra](installation.md#ghidra) and [first-query deadlines](mcp-contracts.md#ghidra-first-query-deadlines-and-recovery).                                                               |
| `REA_GHIDRA_LANGUAGE_ID`        | Ghidra language ID in `processor:endian:size:variant` form, such as `x86:LE:32:default`; endian is `LE` or `BE`.                                                             | Unset; Ghidra detects the language from the executable header | Forces the import language (passed as `-processor`). REA checks the ID against the installation's language definitions before launch and records it in the analysis profile. Rejected for DOS imports and the PSP Allegrex profile. See [import language and analysis seeds](installation.md#ghidra-import-language-and-analysis-seeds). |
| `REA_GHIDRA_COMPILER_SPEC_ID`   | Ghidra compiler-spec ID of letters, digits and `_ . + -`, such as `default` or `borlandcpp`. It must be one of the selected language's compiler specs.                       | Unset; the language's default spec                            | Selects the compiler spec (passed as `-cspec`). Requires `REA_GHIDRA_LANGUAGE_ID`; setting it alone fails validation. See [import language and analysis seeds](installation.md#ghidra-import-language-and-analysis-seeds).                                                                                                               |
| `REA_GHIDRA_SEED_FILE`          | Absolute path to a tab-separated text file of `address<TAB>kind[<TAB>name]` lines. Kinds are `function`, `code` and `label`; addresses are `0x` hex; `#` lines are comments. | Unset; no seeds                                               | Applies analysis seeds before auto-analysis. The seed digest is part of the analysis profile. See [import language and analysis seeds](installation.md#ghidra-import-language-and-analysis-seeds).                                                                                                                                       |
| `GHIDRA_HEADLESS_MAXMEM`        | JVM heap-size value such as `512M` or `2G`.                                                                                                                                  | Falls back to `GHIDRA_MAXMEM`, then `2G`                      | Heap limit (`-Xmx`) of the Ghidra JVM. REA uses the first nonempty value of `GHIDRA_HEADLESS_MAXMEM`, `GHIDRA_MAXMEM`, then `2G`. Set it in the environment that launches REA. An invalid value makes Java startup fail. See [heap and CPU controls](installation.md#ghidra-heap-and-cpu-controls).                                      |
| `GHIDRA_MAXMEM`                 | JVM heap-size value such as `512M` or `2G`.                                                                                                                                  | `2G` when neither variable is set                             | Second choice for the Ghidra JVM heap limit; see `GHIDRA_HEADLESS_MAXMEM`.                                                                                                                                                                                                                                                               |

### NativeAOT extension

| Variable                   | Accepted values                                                | Default                          | Effect                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_GHIDRA_NATIVEAOT_JAR` | Absolute path to a caller-supplied `rea-ghidra-nativeaot.jar`. | Unset; NativeAOT recovery is off | Enables NativeAOT metadata recovery in Ghidra sessions. REA commits the JAR's SHA-256 into the analysis profile. The JAR runs inside Ghidra, so supply a build you trust. See [NativeAOT recovery](ghidra-nativeaot.md#build-and-configure). |

### IDA

| Variable             | Accepted values                                                                                                                                                                                     | Default                                | Effect                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REA_IDA_MCP_CONFIG` | Absolute path to a JSON file of at most 64 KiB holding an upstream IDA MCP registration: `command`/`args` (optional `env`) or a local `url`, or an `mcpServers` object with an `ida-pro-mcp` entry. | Unset; the IDA provider is unavailable | Supplies the upstream IDA MCP registration REA adapts. Select the provider with `REA_ANALYSIS_PROVIDER=ida`, `--provider ida` or `open_binary.provider_id`. See [IDA provider](ida-provider.md). |

### Hopper

| Variable                  | Accepted values                                                                | Default                                                                                                                                                                                                                            | Effect                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOPPER_LAUNCHER_PATH`    | Non-empty path to the Hopper executable.                                       | macOS and other non-Linux hosts: `/Applications/Hopper Disassembler.app/Contents/MacOS/hopper`. Linux: the first executable of `/opt/hopper/bin/Hopper` and `~/.local/share/rea/hopper/bin/Hopper`, else `/opt/hopper/bin/Hopper`. | Overrides the launcher REA starts. See [launcher paths and troubleshooting](installation.md#launcher-paths-and-troubleshooting).                                                    |
| `HOPPER_TARGET_PATH`      | Non-empty path of a target.                                                    | Unset; no target opens at startup                                                                                                                                                                                                  | The MCP server opens this target before it serves requests. If the open fails, the server writes the error to stderr and exits with status 1. See [Hopper](installation.md#hopper). |
| `HOPPER_TARGET_KIND`      | `executable` or `database`                                                     | `executable`                                                                                                                                                                                                                       | Kind of the target named by `HOPPER_TARGET_PATH`. It has no other effect.                                                                                                           |
| `HOPPER_LOADER_ARGS_JSON` | JSON array of strings, such as `["-l","Mach-O"]`. Empty strings are preserved. | Unset; REA derives the loader arguments from the target                                                                                                                                                                            | A non-empty array replaces the loader arguments REA derives for Hopper's non-interactive CLI. An invalid or non-array value fails validation.                                       |

### ILSpy

| Variable             | Accepted values                            | Default | Effect                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_ILSPY_CMD_PATH` | Absolute path to an `ilspycmd` executable. | Unset   | Optional. When set, `rea doctor` runs it to report its version, and a source checkout's `verify:managed` uses it as a real-tool oracle. Managed inspection itself needs no ILSpy. See [tool and packaging boundary](managed-code-analysis.md#tool-and-packaging-boundary). |

## Android and devices

| Variable                          | Accepted values                                                                                                            | Default                                                        | Effect                                                                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_JADX_MCP_JAR`                | Absolute path to a readable `jadx-headless-mcp` 0.7.1 JAR.                                                                 | Unset; Android analysis is unavailable                         | Selects the JADX engine for static APK analysis. REA checks the JAR's bridge classes and never downloads it. Also needs a full JDK; see `JAVA_HOME` under [Ghidra](#ghidra). See [Android analysis](android-analysis.md#supply-tools). |
| `REA_JADX_HEAP_MIB`               | Positive decimal integer. Unit: MiB.                                                                                       | Unset; REA passes no heap flag                                 | Adds `-Xmx<value>m` to the JADX JVM. An invalid value fails Android analysis with the `open_options_invalid` code. See [resource and lifecycle limits](android-analysis.md#resource-and-lifecycle-limits).                             |
| `REA_JADX_ACTIVE_PROCESSOR_COUNT` | Positive decimal integer up to 2147483647. Unit: processors.                                                               | Unset; REA passes no override                                  | Adds `-XX:ActiveProcessorCount=<value>` to the JADX JVM. The provider still uses one JADX worker. See [resource and lifecycle limits](android-analysis.md#resource-and-lifecycle-limits).                                              |
| `REA_APKTOOL_COMMAND`             | Absolute path to an Apktool launcher. A Windows `.bat` or `.cmd` launcher runs through `cmd.exe`.                          | Unset or blank: `apktool` from `PATH`                          | Selects the Apktool launcher for resource decoding. A relative value fails with a `not_absolute` configuration error. See [Apktool resource analysis](apktool-resource-analysis.md).                                                   |
| `REA_ADB_PATH`                    | Absolute path to an `adb` binary.                                                                                          | Unset or blank: `adb` from `PATH`                              | Selects the `adb` binary for device inspection and acquisition. A relative value fails with a `not_absolute` configuration error. See [ADB device analysis](adb-device-analysis.md#supply-tools).                                      |
| `REA_JEB_MCP_URL`                 | Absolute `http` or `https` URL whose host is the literal `127.0.0.1` or `[::1]`. No credentials, query string or fragment. | `http://127.0.0.1:8425/mcp` (also when set to an empty string) | Endpoint of a caller-started JEB client serving MCP. REA neither installs nor launches JEB. See [JEB analysis](jeb-analysis.md).                                                                                                       |

## Web and JavaScript

| Variable                         | Accepted values                                                                | Default                                         | Effect                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_BROWSER_EXECUTABLE`         | Absolute path to a Chromium-based browser that supports `import.meta.resolve`. | Unset; native module resolution is unavailable  | Browser that `trace-web-module-imports` launches for native ES import resolution. REA installs no browser. Browser scenarios name their executable in the scenario instead; see [browser scenario contract](browser-scenario-contract.md). See [website module trace](website-module-trace.md#select-the-source-and-context). |
| `REA_BROWSER_NO_SANDBOX`         | `true`. Any other value is ignored.                                            | Unset; Chromium keeps its sandbox               | Adds Chromium's `--no-sandbox` launch option for module resolution on hosts that require it. It does not create an REA security boundary. See [website module trace](website-module-trace.md#engine-and-lifecycle).                                                                                                           |
| `REA_WAKARU_COMMAND`             | Absolute path to a Wakaru ^1.13.0 executable (Linux x64).                      | Unset; Wakaru recovery is unavailable           | Selects the caller-supplied Wakaru binary. REA reports its path, SHA-256 and observed version. See [JavaScript recovery](javascript-recovery.md#caller-supplied-engine).                                                                                                                                                      |
| `REA_JAVASCRIPT_PRLIMIT_COMMAND` | Absolute path to util-linux `prlimit`.                                         | `/usr/bin/prlimit`                              | Resource limiter that wraps Wakaru. Must be an executable regular file. See [JavaScript recovery](javascript-recovery.md#caller-supplied-engine).                                                                                                                                                                             |
| `REA_MITMDUMP_COMMAND`           | Absolute path to a `mitmdump` 12.2.3 executable (Linux only).                  | Unset; native mitmproxy decoding is unavailable | Decodes native mitmproxy captures offline. HAR captures need no external engine. See [formats and upstream profiles](web-network-captures.md#formats-and-upstream-profiles).                                                                                                                                                  |

## Firmware, crashes, WASM and EVM

| Variable                       | Accepted values                                                                                                             | Default                                                            | Effect                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_BINWALK_COMMAND`          | Absolute path to a Binwalk 3.1.x executable (Linux only).                                                                   | Unset; firmware region inspection is unavailable                   | Binwalk engine for firmware region inspection. REA checks its `--version` banner when a request runs. See [firmware analysis](firmware-analysis.md#caller-supplied-tools).                                                                            |
| `REA_UNBLOB_COMMAND`           | Absolute path to an Unblob 26.6.x executable (Linux only).                                                                  | Unset; firmware extraction is unavailable                          | Unblob engine for explicit firmware extraction. Inspection and extraction have independent prerequisites. See [firmware analysis](firmware-analysis.md#caller-supplied-tools).                                                                        |
| `REA_FIRMWARE_PRLIMIT_COMMAND` | Absolute path to util-linux `prlimit`.                                                                                      | `/usr/bin/prlimit`                                                 | Resource limiter for both firmware engines. See [firmware analysis](firmware-analysis.md#caller-supplied-tools).                                                                                                                                      |
| `REA_PWNTOOLS_PYTHON`          | Absolute path to a Python executable whose environment has pwntools 4.15.0, pyelftools 0.33 and Unicorn 2.1.2 (Linux x64).  | Unset; binary layout and recorded-crash inspection are unavailable | Python used for offline binary layout inspection and recorded-crash (core file) inspection. REA never installs Python or packages. See [binary diagnostics](binary-diagnostics.md#bring-your-own-engine) and [recorded crashes](recorded-crashes.md). |
| `REA_PWNDBG_GDB`               | Absolute path to an executable `gdb`.                                                                                       | `/usr/bin/gdb`                                                     | GDB for the optional debugger mapping context of `inspect-recorded-crash --debugger-context`. See [optional debugger mapping context](recorded-crashes.md#optional-debugger-mapping-context).                                                         |
| `REA_PWNDBG_GDBINIT`           | Absolute path to a readable pwndbg `gdbinit.py` file.                                                                       | Unset; requesting debugger context fails                           | pwndbg entry point for the debugger mapping context. Both this and `REA_PWNDBG_VENV_PATH` are required when debugger context is requested. See [optional debugger mapping context](recorded-crashes.md#optional-debugger-mapping-context).            |
| `REA_PWNDBG_VENV_PATH`         | Absolute path to a readable pwndbg virtual-environment directory.                                                           | Unset; requesting debugger context fails                           | Python environment pwndbg runs in. See [optional debugger mapping context](recorded-crashes.md#optional-debugger-mapping-context).                                                                                                                    |
| `REA_WABT_BIN_DIRECTORY`       | Absolute path to a directory containing executable `wasm-validate`, `wasm-objdump` and `wasm2wat` (with `.exe` on Windows). | Unset; WASM inspection is unavailable                              | WABT 1.0.42 tools for `inspect-wasm-artifact`. REA validates the files and version banners when a request runs. See [WASM artifacts](wasm-artifacts.md).                                                                                              |
| `REA_EVM_PRLIMIT_COMMAND`      | Absolute path to util-linux `prlimit`.                                                                                      | `/usr/bin/prlimit`                                                 | Resource limiter for offline EVM interface inspection (Linux x64). Must be an executable regular file. See [EVM bytecode](evm-bytecode.md).                                                                                                           |

## Redaction

| Variable                             | Accepted values                                                                                         | Default     | Effect                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_REFERENCE_SECRET_PATTERNS_JSON` | JSON array of non-empty strings, each a gitignore-style path pattern, such as `["secrets/**","*.pem"]`. | `[]` (none) | Marks paths of a historical source tree as sensitive during `rea import-reference-source`. Matching files are excluded and reported separately as configured-secret exclusions. REA does not infer secrecy from names or content. See [import historical source](cli.md#import-historical-source). |

## Internal variables

Other `REA_*` names appear in the code or scripts, but they are not
configuration. REA or its scripts set them for their own purposes, so do not
set them yourself:

- `REA_PROCESS_RUN_ID` is set by REA on child processes it supervises, to
  establish process ownership. Process scenarios reserve it and reject a caller
  value.
- `REA_PACKAGE_VERSION` is set by the `scripts/rea.mjs` launcher.
- `REA_BUILD_COMMIT` is build metadata reported as `package.build_commit` in the
  server identity. Release builds set it.
- `REA_CORE_CONTEXT_REQUEST` is set by REA for the GDB child of the debugger
  mapping context.
- `REA_OWNS_PROCESS_LIFETIME`, `REA_SOCKET`, `REA_TOKEN`, `REA_RUN_ID` and
  `REA_TARGET_PATH` are values REA writes into the Hopper bridge script it
  generates for each session.
- `REA_X11_DIAGNOSTIC=` is the prefix of a diagnostic line the Linux Hopper
  display helper prints.
- `REA_TEST_*` (for example `REA_TEST_PRIVATE_RUNTIME_PATH`) are set by tests
  and verification scripts.

The npm verification and fixture scripts of a source checkout read further
variables that the runtime never reads, such as `REA_FIRMWARE_PYTHON`,
`REA_FIRMWARE_CC`, `REA_FIRMWARE_VERIFY_*`, `REA_FIRMWARE_MKE2FS_COMMAND`,
`REA_FIRMWARE_FIXTURE_ROOT`, `REA_FIRMWARE_TEST_ENTRYPOINT`,
`REA_MANAGED_APP_MANIFEST_PATH`, `REA_ELECTRON_EXECUTABLE`,
`REA_NATIVEAOT_BUILD_ROOT` and `REA_NATIVEAOT_SOURCE`. They are documented in
[testing](testing.md) and the guide of the feature they verify.

## Containers

In the Docker image (see [Docker and VS Code](docker-vscode.md#configure-rea)),
pass variables with `docker run -e NAME=value`. When the image was built with
`WITH_GHIDRA=1`, the entrypoint sets `GHIDRA_INSTALL_DIR` and `JAVA_HOME`
automatically unless you pass your own values. Every path variable must name a
path inside the container, so mount the tools and targets you want to use and
pass the in-container paths.

## Agent registrations

An MCP client starts REA with its own environment, not the one of your terminal.
To configure a registered server, add the variables to the `env` object of the
REA entry in the client configuration (for example `mcpServers.rea.env`), then
restart the client. `rea setup` shows each environment entry it plans to write
and keeps valid overrides, such as `REA_MCP_INPUT_SCHEMA_PROFILE` and
`REA_MCP_MAX_RESPONSE_BYTES`, in an existing REA entry. See
[Review setup changes](installation.md#review-setup-changes) and
[Other client settings](installation.md#other-client-settings).

`rea setup` and `rea doctor` also read variables that the agent clients own,
such as `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `OPENCODE_CONFIG`,
`GEMINI_CLI_HOME`, `QWEN_HOME` and `PI_CODING_AGENT_DIR`, to find each client's
configuration. These are client settings, not REA configuration; see
[Supported agents](installation.md#supported-agents).

## Sources

- `src/application/CustomPromptLibrary.ts` (`REA_PROMPTS_DIR`)
- `src/config/environment.ts`, `src/config/parseConfig.ts`,
  `src/config/parsers.ts`, `src/config/types.ts`
- `src/config/ghidraStartupTimeout.ts`, `src/config/ghidraLanguageOverride.ts`
- `src/config/mcpResponseBudget.ts`, `src/config/mcpInputSchemaProfile.ts`,
  `src/config/homeDirectory.ts`
- `src/contracts/providerSelection.ts`, `src/composition/binary.ts`
- `src/logger.ts`, `src/cli.ts`, `src/main.ts`, `src/main/startup.ts`,
  `src/server/createServer.ts`, `src/server/toolResult.ts`
- `src/process/snapshotEnvironment.ts`
- `src/ghidra/GhidraInstallation.ts`, `src/ghidra/GhidraJavaLaunch.ts`,
  `src/ghidra/GhidraAnalysisSeeds.ts`, `src/ghidra/GhidraLanguageCatalog.ts`,
  `src/ghidra/GhidraAnalysisProfile.ts`, `src/ghidra/GhidraProviderClient.ts`
- `src/ida/IdaConfiguration.ts`
- `src/hopper/HopperProvider.ts`, `src/hopper/HopperAnalysisProfile.ts`
- `src/application/DoctorDiagnostics.ts`, `src/application/Doctor.ts`,
  `src/application/ReferenceSourceImportPolicy.ts`,
  `src/application/SupportedClients.ts`, `src/cli/utilityCommands.ts`
- `src/android/JadxConfiguration.ts`, `src/android/JadxRelease.ts`,
  `src/apktool/ApktoolConfiguration.ts`, `src/adb/AdbConfiguration.ts`,
  `src/jeb/JebMcpEndpoint.ts`, `src/jeb/JebProvider.ts`
- `src/browser/modules/NativeModuleResolver.ts`,
  `src/javascript/recovery/WakaruCommand.ts`,
  `src/browser/history/MitmproxyCaptureAdapter.ts`
- `src/firmware/FirmwareCommand.ts`, `src/native/pwntools/PwntoolsDecoder.ts`,
  `src/native/pwndbg/PwndbgCoreContext.ts`, `src/wasm/WabtArtifactProvider.ts`,
  `src/evm/EvmoleInterfaceProvider.ts`
- `src/process/ProviderProcess.ts`, `src/domain/process/processScenario.ts`,
  `src/serverIdentity.ts`, `src/hopper/BridgeLauncher.ts`,
  `src/hopper/LinuxPrivateDisplayDiagnostic.ts`, `scripts/rea.mjs`,
  `bridge/pwndbg/launch_impl.py`
