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
| `./build.sh` | Clones LiquidDesktop from GitHub, builds its package and the installer's, then runs `mkarchiso` (asks for sudo). |
| `./build.sh --packages-only` | Stops before `mkarchiso`, so it needs no sudo. Builds the packages, the local repo and the profile in `build/`. |
| `./build.sh --clean` | Deletes `build/` first. |
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
- **LiquidDesktop**, built from its own [PKGBUILD](https://github.com/arc360alt/LiquidDesktop/blob/main/packaging/arch/PKGBUILD), along with all its optional helpers (NetworkManager, PipeWire/WirePlumber, Bluetooth, brightnessctl, playerctl, upower, xdg-desktop-portal…).
- **LiquidDesktop's login screen.** greetd runs `liquid-desktop-greeter` inside cage. This is the same setup that LiquidDesktop's *Settings › Lock Screen › Login Screen* writes (`main/sddm.js`, `useWebGreeter`).
- **Flatpak with Flathub** as a system-wide remote (`/etc/flatpak/remotes.d/flathub.flatpakrepo`), which LiquidDesktop's App Store uses directly.
- Fonts (Noto, emoji, CJK), Mesa/Vulkan drivers, GParted and zram swap.

### The live system

When it boots, the `lumen` user is logged straight into LiquidDesktop and **Install Lumen** opens. It's also on the desktop.
If you log out, LiquidDesktop's login screen appears: user `lumen`, password `lumen`. The live user has passwordless sudo.
SSH is off.

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
(layout, variant and a test field), **Storage**, **Account** (name, picture, password, auto-login, root account),
**Review**, and **Install**.

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
6. Initializes the pacman keyring, builds the initramfs, and installs GRUB (UEFI or BIOS).

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
iso/                          archiso profile (releng + Lumen): packages.x86_64, pacman.conf, airootfs/
installer/                    Install Lumen (main/ renderer/ backend/ session/ packaging/ tools/)
LIQUIDDESKTOP-REQUESTS.md     changes for the LiquidDesktop repo itself
```
