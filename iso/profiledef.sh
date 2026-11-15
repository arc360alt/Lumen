#!/usr/bin/env bash
# shellcheck disable=SC2034

iso_name="lumen"
iso_label="LUMEN_$(date --date="@${SOURCE_DATE_EPOCH:-$(date +%s)}" +%Y%m)"
iso_publisher="Lumen <https://github.com/arc360alt/Lumen>"
iso_application="Lumen Live/Install"
iso_version="$(date --date="@${SOURCE_DATE_EPOCH:-$(date +%s)}" +%Y.%m.%d)"
install_dir="arch"
buildmodes=('iso')
bootmodes=('bios.syslinux'
           'uefi.systemd-boot')
pacman_conf="pacman.conf"
airootfs_image_type="squashfs"
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '15' '-b' '1M')
bootstrap_tarball_compression=('zstd' '-c' '-T0' '--auto-threads=logical' '--long' '-19')
file_permissions=(
  ["/etc/shadow"]="0:0:400"
  ["/root"]="0:0:750"
  ["/root/.gnupg"]="0:0:700"
  ["/usr/local/bin/choose-mirror"]="0:0:755"
  ["/usr/local/bin/Installation_guide"]="0:0:755"
  ["/usr/local/bin/livecd-sound"]="0:0:755"
  ["/usr/local/bin/lumen-live-setup"]="0:0:755"
  ["/usr/local/bin/lumen-live-session"]="0:0:755"
  ["/usr/bin/lumen-graphics"]="0:0:755"
  ["/usr/lib/lumen-update/backend/lumen-update"]="0:0:755"
  ["/usr/lib/lumen-update/session/lumen-updater"]="0:0:755"
  ["/etc/sudoers.d"]="0:0:750"
  ["/etc/sudoers.d/90-lumen-live"]="0:0:440"
)
