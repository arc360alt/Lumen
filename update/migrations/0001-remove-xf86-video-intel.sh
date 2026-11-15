#!/bin/bash
# Remove the old Intel X driver (xf86-video-intel). Xorg prefers it over the built-in modesetting driver, but it
# doesn't support recent Intel graphics (Gen 12+, e.g. Raptor Lake): X then runs without acceleration, OpenGL falls
# back to software (llvmpipe), and LiquidDesktop is slow or draws empty windows. Modesetting is what Arch recommends.
set -euo pipefail
if pacman -Q xf86-video-intel >/dev/null 2>&1; then
  pacman -Rns --noconfirm xf86-video-intel
  echo "Removed xf86-video-intel; the next login uses the modesetting driver."
fi
