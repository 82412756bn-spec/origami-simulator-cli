#!/bin/bash
# Server Environment Test Script
# Tests browser-based CLI functionality in a stable environment

set -e  # Exit on error

echo "=========================================="
echo "OrigamiSimulator CLI - Server Test"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Test function
run_test() {
    local name="$1"
    local cmd="$2"
    echo -n "Testing: $name ... "

    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        ((PASS++))
    else
        echo -e "${RED}FAIL${NC}"
        ((FAIL++))
    fi
}

# Change to project directory
cd /home/rayna/文档/origami-simulator-cli

echo "=== Phase 1: Basic CLI Tests ==="
echo ""

# Test 1: Help command
run_test "Help command" "node src/index.js --help"

# Test 2: Version command
run_test "Version command" "node src/index.js --version"

# Test 3: List presets (no browser needed)
run_test "List presets" "node src/index.js list --simple"

# Test 4: Verify FOLD file (no browser needed)
run_test "Verify FOLD file" "node src/index.js verify examples/sample-crane.fold"

echo ""
echo "=== Phase 2: Browser-Dependent Tests ==="
echo ""

# Test 5: Load preset
run_test "Load preset (miura-ori)" "node src/index.js load --preset miura-ori"

# Test 6: Screenshot
run_test "Screenshot (miura-ori)" "node src/index.js screenshot --preset miura-ori -o /tmp/server-test-m.png"

# Test 7: Load different preset
run_test "Load preset (waterbomb)" "node src/index.js load --preset waterbomb"

# Test 8: Screenshot with custom output
run_test "Screenshot with custom output" "node src/index.js screenshot -o /tmp/server-test-waterbomb.png --preset waterbomb"

echo ""
echo "=== Phase 3: Export Tests ==="
echo ""

# Test 9: Export PNG
run_test "Export PNG" "node src/index.js export -f png -o /tmp/server-export.png --preset miura-ori"

# Test 10: Load and export (multiple presets)
run_test "Load and export workflow" "node src/index.js load --preset lang-honeycomb && node src/index.js export -f png -o /tmp/server-lang.png --preset lang-honeycomb"

echo ""
echo "=== Phase 4: Analysis Tests ==="
echo ""

# Test 11: Analyze preset
run_test "Analyze preset" "node src/index.js analyze --preset miura-ori"

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
