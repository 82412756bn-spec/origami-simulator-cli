#!/bin/bash
# OrigamiSimulator CLI - Basic Usage Examples
# Save as: examples/basic-usage.sh

echo "=== OrigamiSimulator CLI Demo ==="
echo ""

# 1. List available presets
echo "1. List available presets:"
node src/index.js list
echo ""

# 2. Load a preset and take screenshot
echo "2. Load preset 'cranes' and take screenshot:"
node src/index.js screenshot --preset cranes -o /tmp/cranes.png
echo ""

# 3. Load a different preset
echo "3. Load preset 'flapping-bird' and take screenshot:"
node src/index.js screenshot --preset flapping-bird -o /tmp/flapping-bird.png
echo ""

# 4. Verify a FOLD file
echo "4. Verify FOLD file:"
node src/index.js verify examples/sample-crane.fold
echo ""

# 5. Analyze a preset model
echo "5. Analyze preset model:"
node src/index.js analyze --preset cranes --all
echo ""

echo "=== Demo Complete ==="
