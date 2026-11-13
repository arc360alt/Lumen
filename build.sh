#!/usr/bin/env bash
# Build the Lumen ISO.
#
#   ./build.sh                    build out/lumen-<date>-x86_64.iso
#   ./build.sh --clean            remove build/ first (fresh LiquidDesktop clone, packages rebuilt)
#   ./build.sh --packages-only    stop before mkarchiso (no sudo needed): packages, repository and profile only
#
# Needs an Arch Linux machine with: archiso, base-devel, git, nodejs, npm (and sudo for mkarchiso).
# Run it as your normal user; it asks for sudo only for the final mkarchiso step.
#
# What it does:
#   1. clones LiquidDesktop from GitHub (never touches a local checkout) and builds its own Arch package
#      (packaging/arch/PKGBUILD from the LiquidDesktop repo)
#   2. builds the installer package (installer/packaging/arch/PKGBUILD)
#   3. puts both in a local pacman repository, build/repo
#   4. copies the ISO profile (iso/), points it at that repository, adds the Flathub remote
#   5. runs mkarchiso
#
# Environment: LIQUID_REPO   LiquidDesktop git URL (default: https://github.com/arc360alt/LiquidDesktop.git)
#              LIQUID_BRANCH branch (default: main)
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
B="$HERE/build"
OUT="$HERE/out"
LIQUID_REPO="${LIQUID_REPO:-https://github.com/arc360alt/LiquidDesktop.git}"
LIQUID_BRANCH="${LIQUID_BRANCH:-main}"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as your normal user (makepkg refuses root); it uses sudo for mkarchiso."
for c in mkarchiso makepkg repo-add git npm node curl sudo; do command -v "$c" >/dev/null || die "Missing $c — install: sudo pacman -S --needed archiso base-devel git nodejs npm curl"; done
CLEAN=0 PKGONLY=0
for a in "$@"; do case "$a" in --clean) CLEAN=1 ;; --packages-only) PKGONLY=1 ;; *) die "Unknown option $a" ;; esac; done
((CLEAN)) && { say "Removing build/…"; sudo rm -rf "$B"; }
mkdir -p "$B/src" "$B/repo" "$OUT"

# ------------------------------------------------------------------ 1. LiquidDesktop
say "Fetching LiquidDesktop ($LIQUID_BRANCH)…"
if [ -d "$B/src/LiquidDesktop/.git" ]; then
  git -C "$B/src/LiquidDesktop" fetch --depth 1 origin "$LIQUID_BRANCH"
  git -C "$B/src/LiquidDesktop" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$LIQUID_BRANCH" "$LIQUID_REPO" "$B/src/LiquidDesktop"
fi
say "Building the liquid-desktop-git package…"
rm -f "$B/repo"/liquid-desktop-git-*.pkg.tar.*
# makepkg -d: the runtime dependencies (electron43, picom…) come from the Arch repositories when the ISO is built
( cd "$B/src/LiquidDesktop/packaging/arch" && LIQUID_REPO="$LIQUID_REPO#branch=$LIQUID_BRANCH" PKGDEST="$B/repo" makepkg -f -d --noconfirm )

# ------------------------------------------------------------------ 2. the installer
say "Building the lumen-installer package…"
rm -f "$B/repo"/lumen-installer-*.pkg.tar.*
( cd "$HERE/installer/packaging/arch" && PKGDEST="$B/repo" makepkg -f -d --noconfirm --cleanbuild )

# ------------------------------------------------------------------ 3. local repository
say "Creating the local package repository…"
rm -f "$B/repo"/lumen.db* "$B/repo"/lumen.files*
repo-add -q "$B/repo/lumen.db.tar.gz" "$B/repo"/*.pkg.tar.zst

# ------------------------------------------------------------------ 4. the profile
say "Preparing the ISO profile…"
rm -rf "$B/profile"
cp -a "$HERE/iso" "$B/profile"
sed -i "s#@LUMEN_REPO@#$B/repo#" "$B/profile/pacman.conf"
mkdir -p "$B/profile/airootfs/etc/flatpak/remotes.d"
curl -fsSL https://dl.flathub.org/repo/flathub.flatpakrepo -o "$B/profile/airootfs/etc/flatpak/remotes.d/flathub.flatpakrepo" \
  || die "Couldn't download the Flathub remote file."

# ------------------------------------------------------------------ 5. mkarchiso
((PKGONLY)) && { say "Packages and profile are ready in $B (stopped before mkarchiso)."; exit 0; }
say "Building the ISO with mkarchiso (needs sudo)…"
sudo rm -rf "$B/work"
sudo mkarchiso -v -r -w "$B/work" -o "$OUT" "$B/profile"
sudo chown "$(id -u):$(id -g)" "$OUT"/*.iso 2>/dev/null || true
ISO="$(ls -t "$OUT"/lumen-*.iso | head -1)"
say "Done: $ISO ($(du -h "$ISO" | cut -f1))"
echo "    Try it in a VM:  run_archiso -u -i \"$ISO\"     (UEFI; drop -u for BIOS)"
echo "    Or write it to a USB stick:  sudo dd if=\"$ISO\" of=/dev/sdX bs=4M status=progress oflag=sync"
