#!/usr/bin/env bash
set -euo pipefail

# Full-suite local test runner
# Runs all checks that CI would run

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "${GREEN}${BOLD}PASS${NC} $1"; }
fail() { echo -e "${RED}${BOLD}FAIL${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}=== $1 ===${NC}"; }

section "Backend Tests"
(cd "$ROOT_DIR/backend" && pytest --parallel -q) && pass "Backend tests" || fail "Backend tests"

section "Frontend Tests"
(cd "$ROOT_DIR/frontend" && npm test -- --run) && pass "Frontend tests" || fail "Frontend tests"

section "SDK Build & Test"
(cd "$ROOT_DIR/sdk" && npm run build && npm test) && pass "SDK build & test" || fail "SDK build & test"

section "Frontend Type Check"
(cd "$ROOT_DIR/frontend" && npx tsc --noEmit) && pass "Frontend types" || fail "Frontend types"

section "SDK Type Check"
(cd "$ROOT_DIR/sdk" && npx tsc --noEmit) && pass "SDK types" || fail "SDK types"

section "API Schema Validation"
(cd "$ROOT_DIR/backend" && python manage.py spectacular --validate --fail-on-warn --file /dev/null) && pass "Schema valid" || fail "Schema validation"

echo -e "\n${GREEN}${BOLD}All checks passed!${NC}"
