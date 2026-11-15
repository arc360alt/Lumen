# Changes requested in LiquidDesktop

Lumen works with LiquidDesktop as it is today (commit `916d4f8`), and nothing here is a blocker.
Each item explains what Lumen does for now and the change that would make it better.

## 1. Run XDG autostart entries at login (important)

LiquidDesktop doesn't start anything from `/etc/xdg/autostart/*.desktop` or `~/.config/autostart/*.desktop`.
For now, the Lumen live ISO opens the installer with a wrapper session script (`/usr/local/bin/lumen-live-session`).
It waits for the window manager, starts `lumen-installer`, then execs `liquid-desktop-session`. Installed systems
also miss what packages expect to autostart: `xdg-user-dirs-update`, polkit agents, nm-applet, Flatpak apps that set
"run at login", and so on.

**Ask:** after the session's window manager is up, launch the autostart entries following the XDG Autostart spec:

- user entries override system ones with the same file name
- skip entries with `Hidden=true`
- respect `OnlyShowIn` / `NotShowIn` against `LiquidDesktop`
- respect `TryExec`

## 2. A way for other apps to get the compositor's blur

`session/picom.conf` blurs behind a window only if its class is `liquid-desktop` / `LiquidDesktop`, or its name starts
with `LiquidBlur`. Install Lumen is a separate Electron app that uses LiquidDesktop's design files, so for now it draws
a nearly opaque window (`--win-alpha: 0.94`). Its glass is ready, though: launched with `--blur`,
it switches to LiquidDesktop's normal `0.72` translucency (`lumen-installer --blur`).

**Ask, either of these:**

- a picom rule for the installer: `match = "class_g = 'Install Lumen' || class_i = 'lumen-installer'"; blur-background = true;`
- better, a generic opt-in that any LiquidDesktop-style app can set, e.g. an X property: `match = "_LIQUID_BLUR@ = 1"; blur-background = true;`

## 3. Create the greeter's data folder when the package is installed (minor)

The package ships `liquid-desktop-greeter.tmpfiles.conf`, but the `greeter` user and video-group membership only get
set up when someone presses *Use LiquidDesktop's login screen* in Settings (`useWebGreeter`). The Lumen installer and
the live ISO repeat those steps themselves.

**Ask:** a `.install` file or a `sysusers.d` snippet in the PKGBUILD would make the package self-contained:

```
u greeter - "greetd greeter user" - /usr/bin/nologin
m greeter video
```

## 4. Optional: a Lumen-aware About pane

About and Settings › General show `/etc/os-release`. Lumen sets `NAME="Lumen"`, `ID=lumen`, `ID_LIKE=arch`
and `LOGO=lumen` (icon at `/usr/share/pixmaps/lumen.svg`).

**Ask:** if the About window shows the distro logo from `LOGO=`, Lumen's logo will appear there too.
Also check that the App Store and the updater treat `ID_LIKE=arch` as Arch. They already do, since `install.sh`
checks `$ID $ID_LIKE`.

## 5. Software cursor for the login screen (bug: upside-down cursor)

In a VM (QEMU virtio-gpu) LiquidDesktop's login screen shows the mouse cursor upside down. Some real GPUs do it too.
The greeter is the only Wayland part of LiquidDesktop, and cage (wlroots) uses the GPU's hardware cursor plane there.
That plane draws the cursor flipped on these GPUs. Lumen now starts cage with `WLR_NO_HARDWARE_CURSORS=1`: the
compositor draws the cursor itself, which is harmless on all hardware and costs nothing for a login screen.

**Ask:** make the same change in `packaging/greetd-config.toml`.
Otherwise *Settings › Lock Screen › Login Screen* (`main/sddm.js`, `useWebGreeter`) rewrites `/etc/greetd/config.toml` without the fix:

```toml
command = "env WLR_NO_HARDWARE_CURSORS=1 cage -s -d -- /usr/bin/liquid-desktop-greeter"
```

`webGreeterActive()` still detects it, because it only looks for `liquid-desktop-greeter` in the file.

## 6. Software rendering: a supported mode, with no black, flashing or empty windows

On computers without a working GPU driver (old NVIDIA cards on nouveau, the "safe graphics" boot entry, VMs without 3D),
Lumen starts the session with `LIBGL_ALWAYS_SOFTWARE=1`, `LIQUID_PICOM_ARGS="--backend xrender"` and
`LIQUID_SOFTWARE_RENDERING=1`. On a 16:10 NVIDIA laptop this showed:

- parts of the screen flashing
- LiquidDesktop's own start-up screen (inside the session, not Plymouth) appearing, disappearing, then coming back
  and staying until shutdown
- windows that are only a blurred pane with no content

**Ask:** see the prompt in Lumen's chat log / below. In short: honour `LIQUID_SOFTWARE_RENDERING=1`
(`app.disableHardwareAcceleration()`, a picom config without GLX-only features), make the start-up screen impossible
to re-show after a renderer reload or GPU-process crash, and check layouts at 16:10.

## 7. A Hardware / Software rendering switch in Settings › Developer

Lumen decides at every start-up (`lumen-graphics`, writing `/etc/environment`): software rendering
(`LIBGL_ALWAYS_SOFTWARE=1`, `LIQUID_SOFTWARE_RENDERING=1`, `LIQUID_PICOM_ARGS="--backend xrender"`) only while no real
GPU driver drives the screen. People still need a way to override it from the desktop.

**Ask:** under the Developer settings, a "Rendering: Automatic / Hardware / Software" choice, saved per user and
applied at the next login by `liquid-desktop-session`:
- Hardware: unset `LIBGL_ALWAYS_SOFTWARE`, `GALLIUM_DRIVER`, `LIQUID_SOFTWARE_RENDERING`, and drop `--backend xrender`
  from `LIQUID_PICOM_ARGS`, even when the system set them.
- Software: set them (and `app.disableHardwareAcceleration()`, see item 6).
- Automatic: leave whatever the system set.
Show the current renderer next to it (e.g. from `glxinfo -B`: "NVIDIA GeForce RTX 4070" vs "llvmpipe"), and on
Lumen, mention `sudo lumen-graphics auto|hardware|software` for the system-wide setting.

## 8. NVIDIA's driver: black windows and background, a slow first 20 seconds

On an NVIDIA laptop with NVIDIA's own driver (hardware rendering), the menu bar and dock drew and worked, but the
wallpaper was black, no app windows appeared, and the first ~20 seconds were very slow. Lumen now passes
`LIQUID_PICOM_ARGS="--xrender-sync-fence"` when NVIDIA drives the screen (picom needs it there).

**Ask:** make `session/picom.conf` NVIDIA-safe by itself (`xrender-sync-fence = true` when the GLX vendor is NVIDIA;
check `use-damage`, `glx-no-stencil` and vsync). Make sure the Settings › Developer *Hardware* switch also removes
`--backend xrender` and the software variables Lumen may have set. Find out what the slow start is: the Electron GPU
process, NVIDIA's shader cache (`__GL_SHADER_DISK_CACHE`), or windows being created before the compositor is ready.

## 9. "Use the dedicated graphics card" for apps (NVIDIA PRIME)

On hybrid laptops the Lumen installer can install `nvidia-prime` (`prime-run`). Apps run on the built-in graphics
unless started with `prime-run`.

**Ask:** in the launcher / Dock, a right-click *Open with Dedicated Graphics* when `prime-run` exists (run the app with
`__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia __VK_LAYER_NV_optimus=NVIDIA_only`, which is all
`prime-run` sets). Also honour `PrefersNonDefaultGPU=true` in .desktop files the same way (part of the Desktop Entry spec).

## 10. Publish light / dark Appearance for other apps

Lumen's Software Update (and later the installer) should look like the desktop, but LD keeps Appearance only in its
localStorage (`liquid.settings.v1` → `"theme"`). Software Update currently digs the value out of LD's LevelDB files,
which works but is fragile.

**Ask:** whenever the effective theme or the setting changes, write the *setting* (`light`, `dark` or `auto`) to
`~/.config/LiquidDesktop/appearance` (one word, newline). Software Update reads that file first. Ideally also tell
other apps the standard way: set `org.gnome.desktop.interface color-scheme` (`prefer-dark` / `default`) and/or
answer the `org.freedesktop.appearance color-scheme` setting through xdg-desktop-portal, so Electron, GTK 4 and Qt
apps follow without anything Lumen-specific.

## 11. Coming back from sleep (lid close) on NVIDIA

On an NVIDIA hybrid laptop (Legion 16IRX8H), opening the lid after sleep gave a black screen with the fans at full
speed. Lumen now sets NVIDIA's S0ix power management for s2idle sleep (`/etc/modprobe.d/lumen-nvidia-sleep.conf`), which
is probably the real cause. If the system resumes but the *desktop* stays black, that part is LD's.

**Ask:** listen for resume (logind's `PrepareForSleep(false)` on D-Bus, or Electron's `powerMonitor` `resume`) and then
redraw: restart picom if it died or stopped drawing, and repaint the shell windows. Lock the screen *before* sleep
(`PrepareForSleep(true)`, with a logind delay inhibitor) rather than after resume, so the desktop isn't seen unlocked.
