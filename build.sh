#!/usr/bin/env bash
# Build the Lumen ISO.
#
#   ./build.sh                    build out/lumen-<date>-x86_64.iso
#   ./build.sh --clean            remove build/ first (fresh LiquidDesktop clone, packages rebuilt)
#   ./build.sh --packages-only    stop before mkarchiso (no sudo needed): packages, repository and profile only
#   ./build.sh --no-drivers       leave the NVIDIA driver off the ISO (~400 MB smaller; the installer then
#                                 downloads it during the install, which needs internet)
#
# Needs an Arch Linux machine with: archiso, base-devel, git, nodejs, npm (and sudo for mkarchiso).
# Run it as your normal user; it asks for sudo only for the final mkarchiso step.
#
# What it does:
#   1. builds LiquidDesktop's own Arch package (packaging/arch/PKGBUILD) from the NEWEST commit on GitHub, from a
#      clean checkout every time (never touches a local checkout)
#   2. builds the installer package (installer/packaging/arch/PKGBUILD)
#   3. puts both in a local pacman repository, build/repo
#   4. copies the ISO profile (iso/), points it at that repository, adds every optional dependency from
#      LiquidDesktop's PKGBUILD to the package list, and adds the Flathub remote
#   5. checks that every package resolves, and bundles the NVIDIA driver as a package repository on the ISO
#   6. runs mkarchiso
#
# Environment: LIQUID_REPO   LiquidDesktop git URL (default: https://github.com/arc360alt/LiquidDesktop.git)
#              LIQUID_BRANCH branch (default: main)
#              LIQUID_OPTDEPENDS_SKIP  optional dependencies of LiquidDesktop to leave out
#                            (default: "sddm qt6-svg xorg-server-xephyr": Lumen uses LiquidDesktop's greetd login screen)
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
B="$HERE/build"
OUT="$HERE/out"
LIQUID_REPO="${LIQUID_REPO:-https://github.com/arc360alt/LiquidDesktop.git}"
LIQUID_BRANCH="${LIQUID_BRANCH:-main}"
LIQUID_OPTDEPENDS_SKIP="${LIQUID_OPTDEPENDS_SKIP:-sddm qt6-svg xorg-server-xephyr}"
# the NVIDIA driver, bundled on the ISO for the installer's Drivers step (the open kernel modules: GeForce GTX 16 /
# RTX 20 and newer). Their dependencies that aren't on the ISO already come along.
DRIVER_PKGS=(nvidia-open nvidia-utils nvidia-settings nvidia-prime libva-nvidia-driver opencl-nvidia)

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run this as your normal user (makepkg refuses root); it uses sudo for mkarchiso."
for c in mkarchiso makepkg repo-add git npm node curl sudo fakeroot bsdtar; do command -v "$c" >/dev/null || die "Missing $c — install: sudo pacman -S --needed archiso base-devel git nodejs npm curl"; done
CLEAN=0 PKGONLY=0 DRIVERS=1
for a in "$@"; do case "$a" in --clean) CLEAN=1 ;; --packages-only) PKGONLY=1 ;; --no-drivers) DRIVERS=0 ;; *) die "Unknown option $a" ;; esac; done
((CLEAN)) && { say "Removing build/…"; sudo rm -rf "$B"; }
mkdir -p "$B/src" "$B/repo" "$OUT"

# ------------------------------------------------------------------ 1. LiquidDesktop (newest commit, every build)
say "Fetching the newest LiquidDesktop ($LIQUID_BRANCH)…"
LD="$B/src/LiquidDesktop"
if [ -d "$LD/.git" ]; then
  git -C "$LD" remote set-url origin "$LIQUID_REPO"
  git -C "$LD" fetch --depth 1 origin "$LIQUID_BRANCH"
  git -C "$LD" reset -q --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$LIQUID_BRANCH" "$LIQUID_REPO" "$LD"
fi
# also drops makepkg's cached copy of the source and old src/ pkg/ folders, so the package is always built
# from this exact commit, with this commit's PKGBUILD
git -C "$LD" clean -q -ffdx
LD_COMMIT="$(git -C "$LD" rev-parse --short HEAD)"
say "LiquidDesktop $LD_COMMIT: $(git -C "$LD" log -1 --format='%s (%cr)')"
say "Building the liquid-desktop-git package…"
rm -f "$B/repo"/liquid-desktop-git-*.pkg.tar.*
# makepkg -d: the runtime dependencies (electron43, picom…) come from the Arch repositories when the ISO is built
( cd "$LD/packaging/arch" && LIQUID_REPO="$LIQUID_REPO#branch=$LIQUID_BRANCH" PKGDEST="$B/repo" makepkg -f -d --cleanbuild --noconfirm )
LD_PKG="$(ls "$B/repo"/liquid-desktop-git-*.pkg.tar.* | head -1)"
LD_VERSION="$(bsdtar -xOf "$LD_PKG" .PKGINFO | sed -n 's/^pkgver = //p')"
[[ "$LD_VERSION" == *"${LD_COMMIT:0:7}"* ]] || die "The LiquidDesktop package ($LD_VERSION) wasn't built from the newest commit ($LD_COMMIT)."
# its optional dependencies (Control Center helpers, App Store backends…), straight from the package just built
mapfile -t LD_OPTDEPS < <(bsdtar -xOf "$LD_PKG" .PKGINFO | sed -n 's/^optdepend = \([^:<>=]*\).*/\1/p' | tr -d ' ' \
  | grep -vxF -f <(tr ' ' '\n' <<<"$LIQUID_OPTDEPENDS_SKIP" | sed '/^$/d') || true)
say "LiquidDesktop $LD_VERSION, with ${#LD_OPTDEPS[@]} optional dependencies: ${LD_OPTDEPS[*]}"

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
{
  echo
  echo "# ---------------------------------------------------------------- added by build.sh"
  echo "# LiquidDesktop $LD_VERSION: every optional dependency in its PKGBUILD"
  printf '%s\n' "${LD_OPTDEPS[@]}"
} >>"$B/profile/packages.x86_64"
# one line per package (duplicates removed), comments and blank lines kept
awk '/^[[:space:]]*(#|$)/ { print; next } !seen[$1]++' "$B/profile/packages.x86_64" >"$B/profile/packages.tmp"
mv "$B/profile/packages.tmp" "$B/profile/packages.x86_64"
mkdir -p "$B/profile/airootfs/etc/flatpak/remotes.d"
curl -fsSL https://dl.flathub.org/repo/flathub.flatpakrepo -o "$B/profile/airootfs/etc/flatpak/remotes.d/flathub.flatpakrepo" \
  || die "Couldn't download the Flathub remote file."

# ------------------------------------------------------------------ 5. check the packages, bundle the NVIDIA driver
# a private copy of the package databases (fakeroot: no sudo needed), the same mirrors mkarchiso uses
say "Checking that every package can be installed…"
PDB="$B/pacman-db"
mkdir -p "$PDB"
P=(--config "$B/profile/pacman.conf" --dbpath "$PDB" --logfile "$B/pacman.log" --noconfirm)
fakeroot pacman -Sy "${P[@]}" >/dev/null
mapfile -t ISO_PKGS < <(grep -Ev '^[[:space:]]*(#|$)' "$B/profile/packages.x86_64")
if ! ISO_ALL="$(pacman -Sp --print-format '%n' "${P[@]}" "${ISO_PKGS[@]}" 2>"$B/resolve.log")"; then
  cat "$B/resolve.log" >&2
  die "Some packages can't be found in the Arch repositories (see above). If one comes from LiquidDesktop's PKGBUILD, leave it out with LIQUID_OPTDEPENDS_SKIP or ask for it to be fixed there."
fi
say "$(wc -l <<<"$ISO_ALL") packages on the ISO."
KERNEL_VER="$(pacman -Sp -dd --print-format '%v' "${P[@]}" linux)"

DRV="$B/profile/airootfs/usr/share/lumen/drivers"
if ((DRIVERS)); then
  say "Bundling the NVIDIA driver ($(pacman -Sp -dd --print-format '%v' "${P[@]}" nvidia-open)) for kernel $KERNEL_VER…"
  mkdir -p "$DRV" "$B/drivers-cache"
  n=0
  # the driver and whatever it needs that the ISO doesn't have already (it's installed into a copy of the ISO)
  while read -r name url; do
    grep -qxF "$name" <<<"$ISO_ALL" && continue
    f="$B/drivers-cache/${url##*/}"
    if [ ! -s "$f" ]; then
      curl -fL --retry 3 -s -o "$f.part" "$url" || die "Couldn't download $url"
      mv "$f.part" "$f"
    fi
    ln -f "$f" "$DRV/" 2>/dev/null || cp "$f" "$DRV/"
    n=$((n + 1))
  done < <(pacman -Sp --print-format '%n %l' "${P[@]}" "${DRIVER_PKGS[@]}")
  repo-add -q "$DRV/lumen-drivers.db.tar.gz" "$DRV"/*.pkg.tar.zst
  rm -f "$DRV"/*.old
  say "$n driver packages ($(du -sh "$DRV" | cut -f1)) in /usr/share/lumen/drivers."
else
  say "Leaving the NVIDIA driver off the ISO (--no-drivers): the installer downloads it when it's chosen."
fi

# what this ISO was built from (the installer shows it; useful in bug reports)
mkdir -p "$B/profile/airootfs/usr/share/lumen"
cat >"$B/profile/airootfs/usr/share/lumen/build-info" <<EOF
LUMEN_BUILD_DATE=$(date -u +%Y-%m-%dT%H:%MZ)
LIQUIDDESKTOP_VERSION=$LD_VERSION
LIQUIDDESKTOP_COMMIT=$LD_COMMIT
KERNEL_VERSION=$KERNEL_VER
NVIDIA_DRIVER_BUNDLED=$DRIVERS
EOF

# ------------------------------------------------------------------ 6. mkarchiso
((PKGONLY)) && { say "Packages and profile are ready in $B (stopped before mkarchiso)."; exit 0; }
say "Building the ISO with mkarchiso (needs sudo)…"
sudo rm -rf "$B/work"
sudo mkarchiso -v -r -w "$B/work" -o "$OUT" "$B/profile"
sudo chown "$(id -u):$(id -g)" "$OUT"/*.iso 2>/dev/null || true
ISO="$(ls -t "$OUT"/lumen-*.iso | head -1)"
# the bundled NVIDIA driver only works with the exact kernel it was built for: mkarchiso downloads its packages
# itself, so check that the mirrors didn't get a new kernel in between
if ((DRIVERS)); then
  ISO_KERNEL="$(bsdtar -xOf "$ISO" arch/pkglist.x86_64.txt 2>/dev/null | awk '$1 == "linux" { print $2 }')"
  if [ -n "$ISO_KERNEL" ] && [ "$ISO_KERNEL" != "$KERNEL_VER" ]; then
    die "A new kernel came out during the build (ISO: $ISO_KERNEL, NVIDIA driver: $KERNEL_VER). Run ./build.sh again."
  fi
fi
say "Done: $ISO ($(du -h "$ISO" | cut -f1)) — LiquidDesktop $LD_VERSION"
echo "    Try it in a VM:  ./run-vm.sh"
echo "    Or write it to a USB stick:  sudo dd if=\"$ISO\" of=/dev/sdX bs=4M status=progress oflag=sync"
