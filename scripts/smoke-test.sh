#!/bin/bash
# scripts/smoke-test.sh — Smoke test suite for indexer deployment
#
# Usage: ./smoke-test.sh [base_url]
#   base_url: Indexer HTTP endpoint (default: http://localhost:4000)
#
# Exit codes:
#   0 = All tests passed
#   1 = Test failed (error message printed to stderr)

set -e

BASE_URL="${1:-http://localhost:4000}"
TIMEOUT=30

echo "============================================"
echo "ELCARE-HUB Indexer Smoke Test Suite"
echo "============================================"
echo "Base URL: ${BASE_URL}"
echo "Timeout: ${TIMEOUT}s"
echo ""

# ── Helper functions ──────────────────────────────────────────────────────────

check_http() {
  local endpoint="$1"
  local expected_status="${2:-200}"
  local url="${BASE_URL}${endpoint}"
  local response
  local http_code
  local body

  # curl -s suppresses progress; --max-time guards against hangs.
  # We capture both body and status code in one request.
  if ! response=$(curl -s --max-time "${TIMEOUT}" -w "\n%{http_code}" "${url}" 2>/dev/null); then
    echo "  ✗ FAILED: ${endpoint} — curl exited with error (endpoint unreachable: ${url})" >&2
    return 1
  fi

  http_code=$(printf '%s' "${response}" | tail -n1)
  body=$(printf '%s' "${response}" | sed '$d')

  # Guard: treat a curl-level failure result (empty or non-numeric code) as unavailable.
  if [ -z "${http_code}" ] || ! printf '%s' "${http_code}" | grep -qE '^[0-9]{3}$'; then
    echo "  ✗ FAILED: ${endpoint} — no HTTP response received from ${url}" >&2
    return 1
  fi

  if [ "${http_code}" != "${expected_status}" ]; then
    echo "  ✗ FAILED: ${endpoint} — expected HTTP ${expected_status}, got ${http_code} (endpoint: ${url})" >&2
    return 1
  fi

  echo "  ✓ ${endpoint} (HTTP ${http_code})"
  # Expose body to the caller via a global so secondary fetches are avoided.
  LAST_BODY="${body}"
  return 0
}

check_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local actual

  actual=$(printf '%s' "${json}" | jq -r ".${field}" 2>/dev/null || echo "")

  if [ "${actual}" != "${expected}" ] && [ "${expected}" != "*" ]; then
    echo "  ✗ FAILED: Expected ${field}=${expected}, Got=${actual}" >&2
    return 1
  fi

  return 0
}

check_metrics() {
  local metric="$1"
  local operator="$2"
  local threshold="$3"
  local value

  value=$(curl -s --max-time "${TIMEOUT}" "${BASE_URL}/metrics" 2>&1 | grep "${metric}" | head -1)

  if [ -z "${value}" ]; then
    echo "  ✗ FAILED: Metric not found: ${metric}" >&2
    return 1
  fi

  local numeric_value
  numeric_value=$(printf '%s' "${value}" | awk '{print $NF}')

  if ! echo "${numeric_value} ${operator} ${threshold}" | bc -l 2>/dev/null; then
    echo "  ✗ FAILED: ${metric} check failed (value: ${numeric_value}, threshold: ${threshold})" >&2
    return 1
  fi

  echo "  ✓ ${metric} (${operator} ${threshold})"
  return 0
}

# ── Test Suite ────────────────────────────────────────────────────────────────

FAILED=0
LAST_BODY=""

echo "--- Phase 1: Health Checks ---"

# Test 1: Basic health endpoint
if ! check_http "/health" "200"; then
  FAILED=$((FAILED + 1))
else
  if ! printf '%s' "${LAST_BODY}" | jq -e '.status == "up"' > /dev/null 2>&1; then
    echo "  ✗ FAILED: /health status is not 'up'" >&2
    FAILED=$((FAILED + 1))
  fi
fi

# Test 2: Readiness probe
if ! check_http "/readyz" "200"; then
  FAILED=$((FAILED + 1))
else
  if ! printf '%s' "${LAST_BODY}" | jq -e '.status == "ready" or .status == "not_ready"' > /dev/null 2>&1; then
    echo "  ✗ FAILED: /readyz response format invalid" >&2
    FAILED=$((FAILED + 1))
  fi
fi

# Test 3: Version endpoint
if ! check_http "/version" "200"; then
  FAILED=$((FAILED + 1))
else
  if ! check_json_field "${LAST_BODY}" "app" "*"; then
    FAILED=$((FAILED + 1))
  fi
fi

echo ""
echo "--- Phase 2: API Endpoint Tests ---"

# Test 4: Listings endpoint
if ! check_http "/api/marketplace/listings" "200"; then
  FAILED=$((FAILED + 1))
else
  if ! printf '%s' "${LAST_BODY}" | jq -e '.data | type == "array"' > /dev/null 2>&1; then
    echo "  ✗ FAILED: /api/marketplace/listings response structure invalid" >&2
    FAILED=$((FAILED + 1))
  fi
fi

# Test 5: Single listing endpoint (with mock ID)
if ! check_http "/api/marketplace/listings/C00000000000000000000000000000000000000000000000000000" "404"; then
  FAILED=$((FAILED + 1))
fi

echo ""
echo "--- Phase 3: SSE Connectivity Tests ---"

# Test 6: SSE endpoint (header check only, don't wait for stream)
sse_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time "${TIMEOUT}" "${BASE_URL}/sse" 2>/dev/null || echo "000")
if [ "${sse_status}" = "200" ]; then
  echo "  ✓ /sse (HTTP 200)"
else
  echo "  ✗ FAILED: /sse endpoint not responding (got HTTP ${sse_status}, endpoint: ${BASE_URL}/sse)" >&2
  FAILED=$((FAILED + 1))
fi

echo ""
echo "--- Phase 4: Metrics Tests ---"

# Test 7: Metrics endpoint
if ! check_http "/metrics" "200"; then
  FAILED=$((FAILED + 1))
else
  required_metrics=(
    "indexer_latest_ledger_processed"
    "indexer_ledger_lag"
    "indexer_sse_active_connections"
    "indexer_db_pool_connections_used"
  )

  for metric in "${required_metrics[@]}"; do
    if ! printf '%s' "${LAST_BODY}" | grep -q "^${metric} "; then
      echo "  ✗ FAILED: Missing metric: ${metric}" >&2
      FAILED=$((FAILED + 1))
    fi
  done
fi

# Test 8: Indexer stall gauge
if ! check_metrics "indexer_stalled" "== 0"; then
  echo "  ⚠ WARNING: Indexer may be stalled (check logs)"
fi

# Test 9: Sync lag threshold
lag=$(curl -s --max-time "${TIMEOUT}" "${BASE_URL}/metrics" 2>/dev/null | grep "^indexer_ledger_lag " | awk '{print $NF}')
if [ -n "${lag}" ] && [ "${lag}" -gt 500 ] 2>/dev/null; then
  echo "  ⚠ WARNING: Sync lag is high (${lag} ledgers)"
fi

echo ""
echo "--- Phase 5: Configuration Tests ---"

# Test 10: Config validation (via environment)
if command -v node &> /dev/null; then
  echo "  ✓ Node.js available for config validation"
else
  echo "  ⚠ WARNING: Node.js not available for config validation"
fi

echo ""
echo "============================================"
echo "Test Results"
echo "============================================"

if [ ${FAILED} -eq 0 ]; then
  echo "✓ All smoke tests passed!"
  echo ""
  health_status=$(curl -s --max-time "${TIMEOUT}" "${BASE_URL}/health" 2>/dev/null | jq -r '.status' 2>/dev/null || echo 'unknown')
  sync_lag=$(curl -s --max-time "${TIMEOUT}" "${BASE_URL}/metrics" 2>/dev/null | grep "^indexer_ledger_lag " | awk '{print $NF}')
  sse_conns=$(curl -s --max-time "${TIMEOUT}" "${BASE_URL}/metrics" 2>/dev/null | grep "^indexer_sse_active_connections " | awk '{print $NF}')
  echo "Health Status: ${health_status}"
  echo "Sync Lag: ${sync_lag} ledgers"
  echo "SSE Connections: ${sse_conns}"
  exit 0
else
  echo "✗ ${FAILED} smoke test(s) failed!"
  exit 1
fi