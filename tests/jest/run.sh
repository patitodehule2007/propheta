#!/usr/bin/env bash

# =============================================================================
# Runs the Jest integration suite against an ephemeral Compose stack.
#
# Shared by the pre-push hook and the CI test job so the two can never drift.
#
# The one-shot services are driven with `run --rm` rather than `up`: with
# `up --exit-code-from tests`, Compose aborts the moment ANY container exits,
# and db-init-test exiting 0 tears down db-test before db-seed-test can reach
# it. Sequencing them explicitly also reports which step failed.
# =============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_DIR/tests/jest/docker-compose.jest.yml"

compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

cleanup() {
    compose down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

# db-init-test/db-seed-test bake the SQL into the image, so they must be rebuilt
# or schema/RLS edits never reach the freshly initialized database.
compose build db-init-test db-seed-test backend-test tests

compose up -d db-test
compose run --rm -T db-init-test

# backend-test depends on db-seed-test with service_completed_successfully, so
# this also runs the seed.
compose up -d backend-test

if ! compose run --rm -T tests; then
    echo "--- backend-test logs ---" >&2
    compose logs backend-test >&2
    exit 1
fi
