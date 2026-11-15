#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_DIR="/var/www/baratosdachina"
readonly SERVICE_NAME="baratosdachina"
readonly EXPECTED_COMMIT="${1:-}"

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid commit SHA." >&2
  exit 2
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This deployment script must run with sudo." >&2
  exit 2
fi

cd "$PROJECT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Production checkout has local changes; deployment cancelled." >&2
  exit 3
fi

git fetch --quiet origin main

if ! git merge-base --is-ancestor HEAD "$EXPECTED_COMMIT"; then
  echo "Refusing a non-fast-forward deployment." >&2
  exit 4
fi

readonly TEST_DIR="$(mktemp -d /tmp/baratosdachina-deploy.XXXXXX)"
cleanup() {
  rm -rf -- "$TEST_DIR"
}
trap cleanup EXIT

git archive "$EXPECTED_COMMIT" | tar -x -C "$TEST_DIR"
(cd "$TEST_DIR" && node --test)

git merge --ff-only "$EXPECTED_COMMIT"
systemctl restart "$SERVICE_NAME"

for _ in {1..15}; do
  if curl --fail --silent --show-error http://127.0.0.1:3100/ >/dev/null; then
    echo "Deployment complete: $EXPECTED_COMMIT"
    exit 0
  fi
  sleep 1
done

echo "Service did not pass its health check." >&2
systemctl status "$SERVICE_NAME" --no-pager >&2 || true
exit 5
