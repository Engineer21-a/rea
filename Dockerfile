# syntax=docker/dockerfile:1.7
#
# REA container image: the packaged CLI and stdio MCP server, optionally with a
# JDK and Ghidra for headless native analysis. See docs/docker-vscode.md.
#
#   docker build -t rea .                                        # REA only
#   docker build -t rea:ghidra --build-arg WITH_GHIDRA=1 .       # + JDK 21 + Ghidra
#   docker run -i --rm -v "$PWD:$PWD" -w "$PWD" rea:ghidra mcp   # MCP over stdio
#
# Behind a TLS-intercepting proxy, pass its CA bundle as a build secret:
#   docker build --secret id=extra_ca,src=/path/to/ca.pem -t rea .

# Node.js matching .nvmrc, pinned by digest. Override NODE_IMAGE to rebase.
ARG NODE_IMAGE=node:24.18.0-trixie-slim@sha256:ae91dcc111a68c9d2d81ff2a17bda61be126426176fde6fe7d08ab13b7f50573

# Optional local Ghidra release. Supply it with
#   --build-context ghidra-dist=/directory/containing/the/zip
# to avoid the download; the default stage is empty.
FROM scratch AS ghidra-dist

# Build the package exactly as npm would publish it.
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV HUSKY=0 \
    DEBIAN_FRONTEND=noninteractive \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json .npmrc .nvmrc ./
COPY scripts/prepare.mjs scripts/prepare.mjs
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci
COPY . .
RUN mkdir -p /out && npm pack --pack-destination /out \
    && mv /out/rea-agents-*.tgz /out/rea-agents.tgz

# Unpack Ghidra once, verified, outside the runtime image.
FROM ${NODE_IMAGE} AS ghidra
ARG WITH_GHIDRA=0
ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
ARG GHIDRA_SHA256=ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=ghidra-dist / /tmp/ghidra-input/
RUN --mount=type=secret,id=extra_ca,required=false \
    set -eu; \
    mkdir -p /opt/ghidra; \
    if [ "$WITH_GHIDRA" != "1" ]; then exit 0; fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip; \
    archive="$(find /tmp/ghidra-input -maxdepth 1 -name 'ghidra_*_PUBLIC_*.zip' | head -n 1)"; \
    if [ -z "$archive" ]; then \
      [ -n "$GHIDRA_SHA256" ] || { echo "GHIDRA_SHA256 is required for a downloaded Ghidra release" >&2; exit 1; }; \
      archive=/tmp/ghidra.zip; \
      if [ -s /run/secrets/extra_ca ]; then \
        cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/ca.pem; \
        export CURL_CA_BUNDLE=/tmp/ca.pem; \
      fi; \
      curl -fsSL --proto '=https' --tlsv1.2 --retry 3 -o "$archive" "$GHIDRA_URL"; \
    fi; \
    if [ -n "$GHIDRA_SHA256" ]; then \
      echo "$GHIDRA_SHA256  $archive" | sha256sum -c -; \
    fi; \
    unzip -q "$archive" -d /tmp/ghidra-unpacked; \
    root="$(find /tmp/ghidra-unpacked -mindepth 1 -maxdepth 1 -type d -name 'ghidra_*_PUBLIC' | head -n 1)"; \
    [ -x "$root/support/analyzeHeadless" ] || { echo "The archive is not an official Ghidra release" >&2; exit 1; }; \
    cp -a "$root/." /opt/ghidra/; \
    rm -rf /tmp/ghidra-unpacked /tmp/ghidra.zip /var/lib/apt/lists/*

# VS Code dev container for working on this repository (see .devcontainer/).
FROM ${NODE_IMAGE} AS devcontainer
ARG WITH_GHIDRA=0
ARG WITH_JDK=0
ARG EXTRA_APT_PACKAGES=""
ENV DEBIAN_FRONTEND=noninteractive
RUN set -eu; \
    packages="ca-certificates git openssh-client procps python3 python3-venv"; \
    if [ "$WITH_JDK" = "1" ] || [ "$WITH_GHIDRA" = "1" ]; then \
      packages="$packages openjdk-21-jdk-headless"; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends $packages $EXTRA_APT_PACKAGES; \
    rm -rf /var/lib/apt/lists/*
COPY --from=ghidra /opt/ghidra /opt/ghidra
USER node

FROM ${NODE_IMAGE} AS runtime
ARG WITH_GHIDRA=0
ARG WITH_JDK=0
# Extra Debian packages for optional providers, e.g. "python3 adb binwalk".
ARG EXTRA_APT_PACKAGES=""
ENV DEBIAN_FRONTEND=noninteractive
RUN set -eu; \
    packages="ca-certificates procps tini"; \
    if [ "$WITH_JDK" = "1" ] || [ "$WITH_GHIDRA" = "1" ]; then \
      packages="$packages openjdk-21-jdk-headless"; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends $packages $EXTRA_APT_PACKAGES; \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /out/rea-agents.tgz /tmp/rea-agents.tgz
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install --global --no-audit --no-fund --no-update-notifier /tmp/rea-agents.tgz \
    && rm /tmp/rea-agents.tgz \
    && npm cache clean --force
COPY --from=ghidra /opt/ghidra /opt/ghidra
COPY docker/entrypoint.sh /usr/local/bin/rea-entrypoint
RUN chmod 0755 /usr/local/bin/rea-entrypoint

# The image's "node" user (uid 1000) runs REA; override with --user as needed.
USER node
WORKDIR /work
ENV REA_LOG_LEVEL=warn
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/rea-entrypoint"]
CMD ["mcp"]
