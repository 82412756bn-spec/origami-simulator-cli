#!/usr/bin/env python3
"""
Download FOLD files from origami-simulator-cli by downloading SVG crease patterns
and converting them using the local SVG to FOLD converter.
"""

import subprocess
import json
import os
import urllib.request
from pathlib import Path

# Base URL for SVG assets
BASE_URL = "https://origamisimulator.org/assets"

# Preset list with their SVG paths
PRESETS = {
    'miura-ori': 'Tessellations/miura-ori.svg',
    'waterbomb-base': 'Bases/waterbombBase.svg',
    'square-base': 'Bases/squareBase.svg',
    'bird-base': 'Bases/birdBase.svg',
    'boat-base': 'Bases/boatBase.svg',
    'frog-base': 'Bases/frogBase.svg',
    'cranes': 'Origami/traditionalCrane.svg',
    'flapping-bird': 'Origami/flappingBird.svg',
    'flat-crane': 'Origami/flat_crane.svg',
    'hypar': 'Origami/hypar.svg',
    'square-twist': 'Origami/singlesquaretwist.svg',
    'waterbomb': 'Tessellations/waterbomb.svg',
    'flower-tower': 'Tessellations/FTpoly7.svg',
    'lang-honeycomb': 'Tessellations/langHoneycomb.svg',
    'huffman-extruded': 'Tessellations/huffmanExtrudedBoxes.svg',
    'leafy-opus': 'Curved/Leafy_Opus_T-69.svg',
    'shell14': 'Curved/shell14.svg',
    'rotating-star': 'Curved/Rotating_Star.svg',
    'airplane': 'Origami/airplane.svg',
    'lang-cardinal': 'Origami/langCardinal.svg',
    'lang-orchid': 'Origami/langOrchid.svg',
    'kirigami-triangle': 'Kirigami/auxetic_triangle.svg',
    'popup-simple': 'Popup/popupSimple.svg',
    'bistable-curved': 'Bistable/curvedPleatSimple.svg',
    'polygami-cross': 'Polygami/polygamiCross.svg'
}

# Output directory
OUTPUT_DIR = Path(__file__).parent
SVG_DIR = OUTPUT_DIR / "origami_svgs"
SVG_DIR.mkdir(exist_ok=True)


def download_svg(preset: str) -> Path:
    """Download SVG for a preset"""
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset}")

    svg_path = PRESETS[preset]
    url = f"{BASE_URL}/{svg_path}"
    output_path = SVG_DIR / f"{preset}.svg"

    if output_path.exists():
        print(f"  Using cached: {output_path.name}")
        return output_path

    print(f"  Downloading {url}...")
    try:
        urllib.request.urlretrieve(url, output_path)
        return output_path
    except Exception as e:
        print(f"  Failed to download: {e}")
        return None


# Evolution directory with converters
EVOLUTION_DIR = Path(__file__).parent.parent / "Unbuntu_system" / "evolution"


def convert_svg_to_fold(svg_path: Path, output_path: Path) -> bool:
    """Convert SVG to FOLD using local converter"""
    # Import the converter from evolution directory
    import sys
    sys.path.insert(0, str(EVOLUTION_DIR))

    try:
        from svg_to_fold import SVGToFoldConverter
        converter = SVGToFoldConverter()
        result = converter.convert_file(str(svg_path), str(output_path))
        return True
    except Exception as e:
        print(f"  Conversion error: {e}")
        return False


def analyze_fold(fold_path: str) -> dict:
    """Analyze a FOLD file"""
    import sys
    sys.path.insert(0, str(EVOLUTION_DIR))

    try:
        from origami_analyzer import OrigamiAnalyzer
        analyzer = OrigamiAnalyzer()
        return analyzer.analyze_fold_file(fold_path)
    except Exception as e:
        print(f"  Analysis error: {e}")
        return None


def main():
    print("=" * 70)
    print("Origami FOLD File Generation (SVG Download + Convert)")
    print("=" * 70)
    print()

    # Process each preset
    success = 0
    failed = 0

    for preset, svg_path in PRESETS.items():
        print(f"[{preset}]")

        # Download SVG
        svg_file = download_svg(preset)
        if not svg_file:
            print(f"  ✗ Failed to download SVG")
            failed += 1
            continue

        # Convert to FOLD
        fold_path = OUTPUT_DIR / f"{preset}.fold"
        print(f"  Converting to FOLD...")
        if convert_svg_to_fold(svg_file, fold_path):
            # Analyze
            print(f"  Analyzing...")
            analysis = analyze_fold(str(fold_path))
            if analysis:
                score = analysis['complexity']['complexity_score']
                level = analysis['complexity']['difficulty']
                vertices = analysis['summary']['vertices_count']
                faces = analysis['summary']['faces_count']
                print(f"  ✓ {score:.1f}/10 ({level}) V:{vertices} F:{faces}")
                success += 1
            else:
                print(f"  ✗ Analysis failed")
                failed += 1
        else:
            print(f"  ✗ Conversion failed")
            failed += 1

    print()
    print("=" * 70)
    print(f"Results: {success} success, {failed} failed")
    print(f"FOLD files: {OUTPUT_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    main()