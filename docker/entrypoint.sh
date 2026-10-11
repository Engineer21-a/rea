#!/bin/sh
# Start REA inside the container image or dev container. Explicit settings
# always win; the defaults below only fill in what the image itself provides.
set -eu

# A bundled Ghidra release lives in /opt/ghidra when the image was built with
# WITH_GHIDRA=1. A mounted installation can still be selected explicitly.
if [ -z "${GHIDRA_INSTALL_DIR:-}" ] && [ -x /opt/ghidra/support/analyzeHeadless ]; then
  GHIDRA_INSTALL_DIR=/opt/ghidra
  export GHIDRA_INSTALL_DIR
fi

# Ghidra needs a full JDK; derive JAVA_HOME from the installed javac.
if [ -z "${JAVA_HOME:-}" ] && command -v javac >/dev/null 2>&1; then
  JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
  export JAVA_HOME
fi

# `docker run --user UID:GID` can select a user without a writable home.
if [ -z "${HOME:-}" ] || [ ! -w "${HOME}" ]; then
  HOME="$(mktemp -d "${TMPDIR:-/tmp}/rea-home.XXXXXX")"
  export HOME
fi

# The dev container runs REA from the mounted source checkout instead.
if [ -n "${REA_CLI:-}" ]; then
  exec node "$REA_CLI" "$@"
fi
exec rea "$@"
