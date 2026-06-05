#!/bin/bash
# Origami Animation Setup Script
# Generates folding animation: flat pattern → folded state

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_VIDEO="/home/rayna/文档/Unbuntu_system/goods/2026.04.19飞鹤折纸/output/video/origami_crane_animation.mp4"

echo "=== Origami Animation Setup Script ==="
echo ""
echo "Output: $OUTPUT_VIDEO"
echo ""

cd "$SCRIPT_DIR"

node origami_animation_xvfb.js

echo ""
echo "=== Animation Complete ==="
if [ -f "$OUTPUT_VIDEO" ]; then
    echo "File size: $(ls -lh "$OUTPUT_VIDEO" | awk '{print $5}')"
fi