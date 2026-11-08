#!/usr/bin/env bash
# Downloads gitleaks (linux x64, for the CI runner) to <dir>/gitleaks and checks the release archive against the
# sha256 published with that exact version before unpacking it; a mismatch fails (task 082).
# Usage: infra/scripts/get-gitleaks.sh [dir]   (default: the current directory)
# To upgrade: change both lines below together. The hash is in gitleaks_<version>_checksums.txt of the release
# (and in the asset's digest):
#   https://github.com/gitleaks/gitleaks/releases/tag/v<version> (gitleaks_<version>_linux_x64.tar.gz)
set -euo pipefail
GITLEAKS_VERSION="8.30.1"
GITLEAKS_SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"

# GITLEAKS_URL is for test-workflows.sh only (a local file with the wrong hash); the hash never changes.
GITLEAKS_URL="${GITLEAKS_URL:-https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz}"

cd "${1:-.}"
curl -fsSL -o gitleaks.tar.gz "$GITLEAKS_URL"
if ! echo "${GITLEAKS_SHA256}  gitleaks.tar.gz" | sha256sum -c --quiet -; then
  rm -f gitleaks.tar.gz
  echo "::error::gitleaks ${GITLEAKS_VERSION} doesn't match its published sha256" >&2
  exit 1
fi
tar -xzf gitleaks.tar.gz gitleaks
rm -f gitleaks.tar.gz
chmod +x gitleaks
