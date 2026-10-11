# Docker and VS Code

REA can run from a container image and serve its MCP tools to VS Code or any
other MCP client over stdio. The image contains the packaged CLI built from
this repository, so local changes are part of every rebuild. Ghidra and a JDK
are optional build arguments.

## Build the image

From the repository root:

```bash
docker build -t rea .
docker build -t rea:ghidra --build-arg WITH_GHIDRA=1 .
```

The first image contains Node.js and REA. The second adds OpenJDK 21 (a full
JDK, including `javac`) and a Ghidra release in `/opt/ghidra`. The entrypoint
sets `GHIDRA_INSTALL_DIR` and `JAVA_HOME` from these locations unless you pass
your own values.

| Build argument       | Default                    | Effect                                                                                        |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `WITH_GHIDRA`        | `0`                        | `1` adds Ghidra and OpenJDK 21.                                                               |
| `WITH_JDK`           | `0`                        | `1` adds OpenJDK 21 without Ghidra, for a mounted Ghidra or JADX.                             |
| `GHIDRA_URL`         | Ghidra 12.1.4 release ZIP  | Download location used when no local archive is supplied.                                     |
| `GHIDRA_SHA256`      | SHA-256 of that ZIP        | Required for downloads. Checked against a local archive too; set it empty to skip that check. |
| `EXTRA_APT_PACKAGES` | empty                      | Extra Debian packages for optional providers, for example `python3 adb binwalk gdb`.          |
| `NODE_IMAGE`         | `node:24.18.0-trixie-slim` | Base image, pinned by digest. Change it only together with `.nvmrc`.                          |

REA accepts Ghidra 12.1.x. To use another 12.1 build, pass its `GHIDRA_URL`
and the SHA-256 published on its release page.

### Use a Ghidra archive you already have

The build downloads Ghidra only when no local archive is supplied. Put the
official `ghidra_<version>_PUBLIC_<date>.zip` into an otherwise empty
directory and pass that directory as a named build context:

```bash
docker build -t rea:ghidra --build-arg WITH_GHIDRA=1 \
  --build-context ghidra-dist=/path/to/directory-with-zip .
```

The archive is verified against `GHIDRA_SHA256` and rejected unless it
contains `support/analyzeHeadless`.

### Build behind a TLS-intercepting proxy

If `npm ci` fails with `SELF_SIGNED_CERT_IN_CHAIN`, pass the proxy's CA bundle
as a build secret. The certificate is mounted only while dependencies download
and never becomes part of an image layer:

```bash
docker build --secret id=extra_ca,src=/path/to/proxy-ca.pem -t rea .
```

## Run the MCP server

MCP clients start the server and talk to it over standard input and output, so
the container needs `-i` and no TTY:

```bash
docker run -i --rm -v "$PWD:$PWD" -w "$PWD" rea:ghidra mcp
```

Mount the directory that holds your targets **at the same absolute path**
inside the container. Tool inputs use absolute paths, and Evidence records the
paths it read. With identical paths, a path your agent sees on the host is the
path REA opens in the container, and Evidence stays valid outside it.

The container runs as the image's `node` user (uid 1000). If your files belong
to another user, add `--user "$(id -u):$(id -g)"`; the entrypoint then creates
a private temporary home directory.

### Harden the container for untrusted targets

Static analysis needs no network access and no extra privileges:

```bash
docker run -i --rm --network none --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PWD:$PWD:ro" -w "$PWD" rea:ghidra mcp
```

`--network none` blocks network access for the analysis engines, and `:ro` keeps
the targets read-only. Browser capture, ADB devices, JEB and network captures
need network access, and evidence exports need a writable output directory;
relax only the restrictions a task needs. A container limits what REA can
reach. It is not a malware sandbox: analyze suspicious samples in a disposable
virtual machine.

### Configure REA

Pass any setting from the [configuration reference](configuration.md) with
`-e`, for example a longer Ghidra startup deadline for large binaries:

```bash
docker run -i --rm -e REA_GHIDRA_STARTUP_TIMEOUT_MS=600000 \
  -v "$PWD:$PWD" -w "$PWD" rea:ghidra mcp
```

The CLI works the same way. Replace `mcp` with any command:

```bash
docker run --rm -v "$PWD:$PWD" -w "$PWD" rea:ghidra doctor --provider ghidra --json
```

### Docker Compose

`compose.yaml` builds the image from environment variables and runs it with
the hardening above. `REA_WORKSPACE` selects the mounted directory (default:
the current directory) and `REA_NETWORK` the network (default: `none`):

```bash
WITH_GHIDRA=1 docker compose build
docker compose run --rm -T rea mcp
REA_NETWORK=bridge docker compose run --rm rea doctor --json
```

## Use REA from VS Code

VS Code reads MCP servers from `.vscode/mcp.json` in a workspace or from the
`mcp.json` of your user profile. Both use a top-level `servers` object.

### Local installation

`rea setup --client vscode` writes the user-profile entry after showing its
plan. For one workspace, create `.vscode/mcp.json` yourself:

```json
{
  "servers": {
    "rea": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "rea-agents@6.4.0", "mcp"]
    }
  }
}
```

To use a build of this repository instead of the npm release, run
`npm ci && npm run build:cached` and point `command` at `node` with the
arguments `["/absolute/path/to/rea/scripts/rea.mjs", "mcp"]`.

### Docker image

Build the image once, then let VS Code start one container per session:

```json
{
  "servers": {
    "rea": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "-v",
        "${workspaceFolder}:${workspaceFolder}",
        "-w",
        "${workspaceFolder}",
        "rea:ghidra",
        "mcp"
      ]
    }
  }
}
```

VS Code replaces `${workspaceFolder}` with the absolute workspace path, so the
container sees your files at the same location. Add `"--network", "none"`
before the image name when you only analyze local files.

### Dev container

`.devcontainer/devcontainer.json` opens this repository in a container with
Node.js, git and the build toolchain, installs dependencies, builds REA, and
registers the built MCP server for VS Code inside the container. Run
**Dev Containers: Reopen in Container** from the command palette. To include
Ghidra, set `WITH_GHIDRA` to `"1"` in the file's `build.args` before you open
it. Inside the dev container, `rea` is not on `PATH`; use
`node scripts/rea.mjs <command>`.

## Updates

The image contains the code it was built from. Rebuild it to update. Do not
run `rea update` inside the container: it would install the upstream
`rea-agents` release from the npm registry over your build, and the image's
global npm directory is not writable for the `node` user anyway.
