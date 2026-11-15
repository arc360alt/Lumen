#!/usr/bin/env bash
# The system files Lumen puts on a computer, laid out as a root file system:
#
#   update/stage-root.sh <lumen repo> <out dir>
#
# build.sh uses it to make the ISO's airootfs, and the updater (lumen-update) uses the same script from the newest
# repo to see what changed, so an updated computer gets exactly the files a fresh ISO would have.
# Paths in update/exclude.list are never touched by updates (live-only files, per-computer settings).
set -euo pipefail
SRC="$(cd "$1" && pwd)"
OUT="$2"
mkdir -p "$OUT"

# 1. the ISO's file overlay
cp -a "$SRC/iso/airootfs/." "$OUT/"

# 2. Software Update (the app and its engine), built from LiquidDesktop's design files like the installer
A="$OUT/usr/lib/lumen-update"
mkdir -p "$A/renderer/liquid/js" "$OUT/usr/bin"
cp -a "$SRC/updater/main" "$SRC/updater/backend" "$SRC/updater/session" "$SRC/updater/package.json" "$A/"
cp -a "$SRC/updater/renderer/index.html" "$SRC/updater/renderer/app.js" "$SRC/updater/renderer/updater.css" "$A/renderer/"
cp -a "$SRC/installer/renderer/css" "$SRC/installer/renderer/img" "$A/renderer/liquid/"
cp -a "$SRC/installer/renderer/js/"{util,icons,ui,store}.js "$A/renderer/liquid/js/"
# the Inter font comes with LiquidDesktop
ln -sfn /usr/lib/liquid-desktop/node_modules "$A/renderer/node_modules"
ln -sfn /usr/lib/lumen-update/backend/lumen-update "$OUT/usr/bin/lumen-update"
ln -sfn /usr/lib/lumen-update/session/lumen-updater "$OUT/usr/bin/lumen-updater"
install -Dm644 "$SRC/updater/packaging/lumen-updater.desktop" "$OUT/usr/share/applications/lumen-updater.desktop"
install -Dm644 "$SRC/installer/renderer/img/lumen.svg" "$OUT/usr/share/icons/hicolor/scalable/apps/lumen-updater.svg"
chmod 755 "$A/backend/lumen-update" "$A/session/lumen-updater"

# 3. file modes from the ISO profile (profiledef.sh file_permissions), as mkarchiso sets them
(
  declare -A file_permissions=()
  # shellcheck disable=SC1091
  source "$SRC/iso/profiledef.sh"
  for p in "${!file_permissions[@]}"; do
    [ -e "$OUT$p" ] && [ ! -L "$OUT$p" ] && chmod "${file_permissions[$p]##*:}" "$OUT$p"
  done
)
exit 0
