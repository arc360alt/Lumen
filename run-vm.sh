#!/usr/bin/env bash
# Run Lumen in a QEMU virtual machine: the newest ISO from out/ (or build/), plus a virtual disk to install onto.
# The VM only ever sees its own disk image (vm/lumen-disk.qcow2), never your real disks — installing in it is safe.
#
#   ./run-vm.sh                 boot the newest ISO (UEFI), with the virtual disk attached
#   ./run-vm.sh --installed     boot the virtual disk only (after installing Lumen in the VM)
#   ./run-vm.sh --bios          legacy BIOS instead of UEFI
#   ./run-vm.sh --iso FILE      use a specific ISO
#   ./run-vm.sh --reset         delete the virtual disk and UEFI settings first (a blank computer)
#   ./run-vm.sh --no-gl         no 3D acceleration (if the window stays black or QEMU complains about OpenGL)
#
# Options: --ram 8G   --cpus 4   --disk-size 40G
# Needs: sudo pacman -S --needed qemu-desktop edk2-ovmf
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
VM="$HERE/vm"
DISK="$VM/lumen-disk.qcow2"
VARS="$VM/OVMF_VARS.4m.fd"
OVMF_CODE=/usr/share/edk2/x64/OVMF_CODE.4m.fd
OVMF_VARS=/usr/share/edk2/x64/OVMF_VARS.4m.fd

ISO="" INSTALLED=0 UEFI=1 RESET=0 GL=1
RAM=8G CPUS="$(( $(nproc) > 8 ? 8 : ($(nproc) > 2 ? $(nproc) / 2 : 2) ))" DISK_SIZE=40G

die() { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }
say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --installed) INSTALLED=1 ;;
    --bios) UEFI=0 ;;
    --iso) ISO="${2:?--iso needs a file}"; shift ;;
    --reset) RESET=1 ;;
    --no-gl) GL=0 ;;
    --ram) RAM="${2:?}"; shift ;;
    --cpus) CPUS="${2:?}"; shift ;;
    --disk-size) DISK_SIZE="${2:?}"; shift ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option $1 (see --help)" ;;
  esac
  shift
done

command -v qemu-system-x86_64 >/dev/null || die "QEMU isn't installed: sudo pacman -S --needed qemu-desktop edk2-ovmf"
((UEFI)) && { [ -f "$OVMF_CODE" ] || die "UEFI firmware not found: sudo pacman -S --needed edk2-ovmf (or use --bios)"; }

# ------------------------------------------------------------------ the ISO
if ! ((INSTALLED)); then
  if [ -z "$ISO" ]; then
    ISO="$(ls -t "$HERE"/out/*.iso "$HERE"/build/*.iso 2>/dev/null | head -1 || true)"
    [ -n "$ISO" ] || die "No ISO found in out/. Build one first: ./build.sh"
  fi
  [ -f "$ISO" ] || die "ISO not found: $ISO"
fi

# ------------------------------------------------------------------ the virtual disk + UEFI settings
mkdir -p "$VM"
if ((RESET)); then
  say "Starting from a blank virtual computer…"
  rm -f "$DISK" "$VARS"
fi
if [ ! -f "$DISK" ]; then
  ((INSTALLED)) && die "There's no virtual disk yet. Run ./run-vm.sh and install Lumen first."
  say "Creating a $DISK_SIZE virtual disk ($DISK)…"
  qemu-img create -q -f qcow2 "$DISK" "$DISK_SIZE"
fi
# the firmware's settings (boot entries GRUB adds) are kept per VM, in a copy of the template
((UEFI)) && [ ! -f "$VARS" ] && cp "$OVMF_VARS" "$VARS"

# ------------------------------------------------------------------ QEMU
ARGS=(
  -name "Lumen" -machine q35 -m "$RAM" -smp "$CPUS"
  -drive "file=$DISK,if=none,id=disk0,format=qcow2,discard=unmap" -device virtio-blk-pci,drive=disk0,bootindex=2
  -nic user,model=virtio-net-pci
  -device qemu-xhci -device usb-tablet
  -rtc base=localtime
)
if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then ARGS+=(-enable-kvm -cpu host); else say "KVM isn't available: the VM will be very slow."; ARGS+=(-cpu max); fi
((UEFI)) && ARGS+=(-drive "if=pflash,format=raw,readonly=on,file=$OVMF_CODE" -drive "if=pflash,format=raw,file=$VARS")
if ! ((INSTALLED)); then
  ARGS+=(-drive "file=$ISO,media=cdrom,readonly=on,if=none,id=cd0" -device ide-cd,drive=cd0,bootindex=1)
fi
# LiquidDesktop's compositor (picom, GLX) and Electron are much smoother with 3D (virgl)
if ((GL)); then ARGS+=(-device virtio-vga-gl -display gtk,gl=on,zoom-to-fit=on); else ARGS+=(-device virtio-vga -display gtk,zoom-to-fit=on); fi
# sound through PipeWire (PulseAudio as a fallback; no sound if neither is there)
for drv in pipewire pa; do
  if qemu-system-x86_64 -audiodev help 2>/dev/null | grep -qx "$drv"; then
    ARGS+=(-audiodev "$drv,id=snd0" -device ich9-intel-hda -device hda-output,audiodev=snd0); break
  fi
done

if ((INSTALLED)); then say "Booting the installed Lumen from $DISK ($( ((UEFI)) && echo UEFI || echo BIOS ))…"
else say "Booting $(basename "$ISO") ($( ((UEFI)) && echo UEFI || echo BIOS ), $RAM RAM, $CPUS CPUs)…"
  echo "    Install onto the virtual disk (“QEMU HARDDISK” / Virtio, $DISK_SIZE) — your real disks aren't visible to the VM."
  echo "    Afterwards: close the VM and run  ./run-vm.sh --installed$( ((UEFI)) || echo ' --bios')"
fi
exec qemu-system-x86_64 "${ARGS[@]}"
