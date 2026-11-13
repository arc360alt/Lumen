#!/bin/sh
# Refresh the LiquidDesktop design files the installer is built from (read-only copy; LiquidDesktop is not changed).
#   sh tools/sync-liquid.sh [path to a LiquidDesktop checkout]     default: ../../LiquidDesktop, else a fresh clone
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LD="${1:-$HERE/../../LiquidDesktop}"
if [ ! -f "$LD/renderer/css/base.css" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 https://github.com/arc360alt/LiquidDesktop.git "$TMP/LiquidDesktop"
  LD="$TMP/LiquidDesktop"
fi
cp "$LD/renderer/css/base.css" "$LD/renderer/css/window.css" "$LD/renderer/css/shell.css" "$HERE/renderer/css/"
cp "$LD/renderer/js/util.js" "$LD/renderer/js/icons.js" "$HERE/renderer/js/"
cp "$LD/LICENSE" "$HERE/renderer/LICENSE.LiquidDesktop"
echo "Synced LiquidDesktop design files from $LD ($(git -C "$LD" rev-parse --short HEAD 2>/dev/null || echo unknown))"
