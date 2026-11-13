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
