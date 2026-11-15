# One-time update steps

Put a script here for anything an update needs that isn't just "this file changed" or "this package is new":
renaming a file, enabling a service, changing a setting, removing something old. Name them so they sort in order:

    0001-enable-lumen-graphics.sh
    0002-move-old-config.sh

Every Lumen computer runs each script **once**, as root, during Software Update (after files and packages are
updated), with `bash`. It's recorded in `/var/lib/lumen-update/migrations.done`. Scripts that exist when an ISO is built
count as already done on computers installed from it (that ISO has the change already).

Rules: make them safe to run on any Lumen system (check before changing), never touch `/home` unless that's the point,
and exit non-zero on failure (the update stops and shows the error; the script runs again next time).
`$LUMEN_REPO_DIR` is the checked-out repository, in case a script needs a file from it.
