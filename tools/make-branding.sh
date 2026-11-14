#!/usr/bin/env bash
# Regenerates Lumen's boot-screen images and fastfetch logo from the Lumen logo (iso/airootfs/usr/share/pixmaps/lumen.svg).
# The results are checked in, so a normal build doesn't need this. Needs: rsvg-convert, ImageMagick (magick), python-pillow.
#
#   sh tools/make-branding.sh
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
SVG="$HERE/iso/airootfs/usr/share/pixmaps/lumen.svg"
PLY="$HERE/iso/airootfs/usr/share/plymouth/themes/lumen"
FF="$HERE/iso/airootfs/usr/share/lumen/fastfetch"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ---- Plymouth (sizes are 2x; the theme scales them to the screen)
rsvg-convert -w 256 -h 256 "$SVG" -o "$PLY/logo.png"
magick -size 480x12 xc:none -fill 'rgba(255,255,255,0.22)' -draw 'roundrectangle 0,0 479,11 6,6' "$PLY/track.png"
magick -size 480x12 xc:none -fill 'rgba(255,255,255,1)'    -draw 'roundrectangle 0,0 479,11 6,6' "$PLY/fill.png"
magick -size 600x76 xc:none -fill 'rgba(255,255,255,0.14)' -stroke 'rgba(255,255,255,0.30)' -strokewidth 2 \
  -draw 'roundrectangle 1,1 598,74 37,37' "$PLY/entry.png"
magick -size 24x24 xc:none -fill white -draw 'circle 12,12 12,3' "$PLY/bullet.png"

# ---- fastfetch: the drop as text art, in the logo's three colours ($1 $2 $3) with the white highlight ($4)
sed -e 's#viewBox="0 0 100 100"#viewBox="15 5 70 94"#' -e 's#<path d="M30 64[^>]*/>##' "$SVG" >"$TMP/shape.svg"
sed -e 's#viewBox="0 0 100 100"#viewBox="15 5 70 94"#' -e 's#fill="url(\#lg[bh])"#fill="none"#g' "$SVG" >"$TMP/hl.svg"
rsvg-convert -w 420 -h 564 "$TMP/shape.svg" -o "$TMP/shape.png"
rsvg-convert -w 420 -h 564 "$TMP/hl.svg" -o "$TMP/hl.png"
python3 - "$TMP" 32 18 >"$FF/logo.txt" <<'PY'
import sys
from PIL import Image
d, W, H = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
shape = Image.open(f'{d}/shape.png').convert('RGBA').resize((W, H), Image.LANCZOS)
hl = Image.open(f'{d}/hl.png').convert('RGBA').resize((W, H), Image.LANCZOS)
for y in range(H):
    row, cur = '', None
    for x in range(W):
        a, h = shape.getpixel((x, y))[3], hl.getpixel((x, y))[3]
        if a < 90: ch, c = ' ', None
        elif h > 110: ch, c = 'o', '$4'
        else:
            t = (x / W + y / H) / 2
            c = '$1' if t < 0.42 else '$2' if t < 0.62 else '$3'
            ch = 'l' if a > 200 else '.'
        if c and c != cur: row += c; cur = c
        row += ch
    print(row.rstrip())
PY
echo "Updated $PLY and $FF/logo.txt"
