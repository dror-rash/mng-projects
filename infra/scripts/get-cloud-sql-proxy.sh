#!/usr/bin/env bash
# Downloads the Cloud SQL Auth Proxy to ./cloud-sql-proxy (linux amd64, for the deploy runner) and checks it against
# the sha256 published with that exact version before making it executable; a mismatch fails (task 078).
# Usage: infra/scripts/get-cloud-sql-proxy.sh
# To upgrade: change both lines below together. The hash is in the release notes' table:
#   https://github.com/GoogleCloudPlatform/cloud-sql-proxy/releases/tag/<version> (cloud-sql-proxy.linux.amd64)
set -euo pipefail
CLOUD_SQL_PROXY_VERSION="v2.14.1"
CLOUD_SQL_PROXY_SHA256="e48115261929445f468ae7ae86be199781bafda56837c9f33644892df8d46997"

# CLOUD_SQL_PROXY_URL is for test-workflows.sh only (a local file with the wrong hash); the hash never changes.
CLOUD_SQL_PROXY_URL="${CLOUD_SQL_PROXY_URL:-https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${CLOUD_SQL_PROXY_VERSION}/cloud-sql-proxy.linux.amd64}"

curl -fsSL -o cloud-sql-proxy "$CLOUD_SQL_PROXY_URL"
if ! echo "${CLOUD_SQL_PROXY_SHA256}  cloud-sql-proxy" | sha256sum -c --quiet -; then
  rm -f cloud-sql-proxy
  echo "::error::cloud-sql-proxy ${CLOUD_SQL_PROXY_VERSION} doesn't match its published sha256" >&2
  exit 1
fi
chmod +x cloud-sql-proxy
