# Lumen

Lumen is Arch Linux with the [LiquidDesktop](https://github.com/arc360alt/LiquidDesktop) environment, Flatpak/Flathub
and LiquidDesktop's own login screen already set up. It also has its own installer, built the same way as LiquidDesktop's apps.

## Build the ISO

On an Arch Linux machine:

```sh
sudo pacman -S --needed archiso base-devel git nodejs npm curl
./build.sh                      # → out/lumen-YYYY.MM.DD-x86_64.iso
```

| | |
|---|---|
| `./build.sh` | Builds LiquidDesktop's package from the **newest commit on GitHub** (a clean checkout every time), builds the installer's, bundles the NVIDIA driver, then runs `mkarchiso` (asks for sudo). |
| `./build.sh --packages-only` | Stops before `mkarchiso`, so it needs no sudo. Builds the packages, the local repo and the profile in `build/`. |
| `./build.sh --clean` | Deletes `build/` first. |
| `./build.sh --no-drivers` | Leaves the NVIDIA driver off the ISO (about 360 MB smaller). The installer then downloads it during the install, which needs internet. |
| `LIQUID_BRANCH=dev ./build.sh` | Builds from another LiquidDesktop branch (or set `LIQUID_REPO`). |

## Try it in a VM

```sh
sudo pacman -S --needed qemu-desktop edk2-ovmf
./run-vm.sh                 # newest ISO in out/, UEFI, with a 40 GB virtual disk to install onto
./run-vm.sh --installed     # afterwards: start the Lumen you installed on the virtual disk
```

The VM only sees its own disk image (`vm/lumen-disk.qcow2`), never your real disks, so it's safe to install Lumen there.
Other options: `--bios` (legacy BIOS), `--reset` (blank virtual disk), `--iso FILE`, `--ram 8G`, `--cpus 4`,
`--disk-size 40G`, and `--no-gl` (turns off 3D acceleration if the window stays black).

## What's in it

- **Everything on the official Arch ISO.** The profile in [iso/](iso/) starts from archiso's `releng` profile, so all of its packages and tools are included.
- **LiquidDesktop**, built from its own [PKGBUILD](https://github.com/arc360alt/LiquidDesktop/blob/main/packaging/arch/PKGBUILD) at the newest commit on every build. Its dependencies come with the package, and `build.sh` adds every *optional* dependency listed in that PKGBUILD to the ISO automatically. When LiquidDesktop adds one, the next build includes it. The exceptions are `sddm`, `qt6-svg` and `xorg-server-xephyr`; change these with `LIQUID_OPTDEPENDS_SKIP`. Before `mkarchiso` runs, the build checks that every package resolves. The commit is recorded in `/usr/share/lumen/build-info`, and the installer's Review step shows it.
- **Lumen boot screen**: a Plymouth theme ([iso/airootfs/usr/share/plymouth/themes/lumen](iso/airootfs/usr/share/plymouth/themes/lumen)). It shows the Lumen drop on black with a thin progress bar, and a glass field when an encrypted disk asks for its passphrase. It runs on the live ISO and on installed systems.
- **fastfetch** with Lumen's own logo, the drop drawn in its blue → purple colours ([/etc/xdg/fastfetch/config.jsonc](iso/airootfs/etc/xdg/fastfetch/config.jsonc)).
- **Graphics drivers.** Mesa for AMD, Intel and nouveau: Vulkan (RADV, ANV, NVK) and VA-API video decoding. **NVIDIA's driver** (`nvidia-open`, `nvidia-utils`, `nvidia-settings`, `nvidia-prime`, `opencl-nvidia`, `libva-nvidia-driver`) is bundled on the ISO as a package repository in `/usr/share/lumen/drivers`, so it can be installed offline. It isn't used by the live session, and it's never copied to the disk unless chosen. Its version matches the ISO's kernel, and `build.sh` stops if the mirrors get a newer kernel during the build.
- **Wi-Fi and Bluetooth firmware** for Intel, MediaTek, Realtek, Atheros and Broadcom cards. This covers current laptops, including the Lenovo Legion Pro 5 16IRX8H.
- **LiquidDesktop's login screen.** greetd runs `liquid-desktop-greeter` inside cage. This is the same setup that LiquidDesktop's *Settings › Lock Screen › Login Screen* writes (`main/sddm.js`, `useWebGreeter`).
- **Flatpak with Flathub** as a system-wide remote (`/etc/flatpak/remotes.d/flathub.flatpakrepo`), which LiquidDesktop's App Store uses directly.
- Fonts (Noto, emoji, CJK), GParted and zram swap.

### The live system

When it boots, the `lumen` user is logged straight into LiquidDesktop and **Install Lumen** opens. It's also on the desktop.
If you log out, LiquidDesktop's login screen appears: user `lumen`, password `lumen`. The live user has passwordless sudo.
SSH is off.
When the open-source NVIDIA driver (nouveau) drives the screen, the live session draws in software (llvmpipe, picom's xrender backend), because OpenGL on nouveau shows only black on recent cards. The boot menu also has a **safe graphics** entry (`nouveau.modeset=0 lumen.safegfx=1`) that always draws in software.

## The installer — [installer/](installer/)

**Install Lumen** is an Electron app in plain JavaScript, laid out like LiquidDesktop (`main/`, `renderer/`, `session/`,
`packaging/arch/PKGBUILD`, and it installs to `/usr/lib/lumen-installer` with a launcher in `/usr/bin`). Its UI is built from
LiquidDesktop's own design files: `base.css`, `window.css`, `shell.css`, `util.js` (the `h()` helper) and `icons.js`.
These are copied verbatim, so the window, glass sidebar, settings groups, toggles, segmented controls and alerts are the
same components as in System Settings. To refresh them from LiquidDesktop:

```sh
cd installer && sh tools/sync-liquid.sh            # from ../../LiquidDesktop, or a fresh clone
```

These are the steps: **Welcome** (language), **Location** (time zone, picked from a map or a list, or detected), **Keyboard**
(layout, variant and a test field), **Storage**, **Drivers**, **Account** (name, picture, password, auto-login, root account),
**Review**, and **Install**.

In the **Drivers** step you see the graphics cards in the computer (from `/sys/bus/pci`) and the driver each one gets:

- **AMD and Intel** cards work out of the box with Mesa, so there's nothing to choose.
- **NVIDIA (GTX 16 / RTX 20 and newer):** you choose **NVIDIA's driver** (the default) or **Nouveau**. NVIDIA's driver is installed offline from the ISO's bundled repository, with the following setup:
  - Hybrid laptops (NVIDIA plus Intel/AMD graphics) get PRIME render offload: the desktop runs on the integrated chip, and apps started with `prime-run` use the NVIDIA card.
  - Laptops also get `nvidia-powerd` (Dynamic Boost).
  - Desktops load the driver in the start-up image, so the boot screen appears on the NVIDIA card.
  - If the driver doesn't match the installed kernel, the installer removes it again and keeps nouveau, so the system still starts.
- **Older NVIDIA cards** keep nouveau, with a note about the legacy driver in the AUR.
- With no NVIDIA card, there's a switch to install the driver anyway, for an eGPU.

To try other hardware in test mode, set `LUMEN_FAKE_GPUS`:

```sh
LUMEN_FAKE_GPUS=laptop npm start     # Intel + RTX 4070 laptop   (or: desktop, old)
```

In the **Storage** step you can:

- **Erase a disk.** GPT, a 1 GiB EFI partition on UEFI, and ext4 / Btrfs (with `@ @home @log @pkg` subvolumes) / XFS. LUKS2 encryption is optional.
- **Use existing partitions.** You choose the partitions for `/`, EFI and an optional `/home` (you can keep its files). os-prober finds other systems for the boot menu. There's also a button that opens GParted.
- Turn zram swap on or off.

**How it installs.** `backend/lumen-install` is a bash script that runs as root. It gets the settings as JSON on stdin, so
passwords never appear on a command line or in a file. It copies the live system's read-only squashfs to the disk (an offline install like Calamares' unpackfs; no internet needed), then:

1. Removes the live-only parts.
2. Sets locale, time zone, keyboard (console and X11) and hostname.
3. Creates the user (in `wheel`, sudo with a password) and a picture for the login screen.
4. Writes greetd's config for LiquidDesktop's login screen, plus an auto-login entry if you chose one.
5. Enables NetworkManager, Bluetooth and greetd.
6. Initializes the pacman keyring and installs the graphics driver that was chosen.
7. Builds the initramfs (systemd-based, with the Plymouth boot screen) and installs GRUB (UEFI or BIOS) with `quiet splash`.

### Trying the installer safely

```sh
cd installer && npm install --omit=dev && npm start      # = electron . --test
```

In `--test` mode every step works, and the install runs the back end with `--dry-run` **without sudo**. It only prints the
commands it would run (see *Show Details*), so nothing on the computer can change. Two more guards: the back end refuses
a real run anywhere but the Lumen live ISO (`/run/archiso` plus `ID=lumen`), and the partition editor is disabled in test mode.
You can also run the back end on its own: `echo '{…}' | bash installer/backend/lumen-install --dry-run`.

## Layout

```
build.sh                      builds everything
run-vm.sh                     runs the newest ISO in QEMU
tools/make-branding.sh        regenerates the boot screen images and the fastfetch logo from the Lumen logo
iso/                          archiso profile (releng + Lumen): packages.x86_64, pacman.conf, airootfs/
installer/                    Install Lumen (main/ renderer/ backend/ session/ packaging/ tools/)
LIQUIDDESKTOP-REQUESTS.md     changes for the LiquidDesktop repo itself
```
