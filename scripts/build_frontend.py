"""Build the frontend into data/web/ before the filesystem image is packed."""

import locale
import os
import shutil
import subprocess
import sys
from pathlib import Path

Import("env")  # noqa: F821 - provided by SCons

PROJECT_DIR = Path(env.subst("$PROJECT_DIR"))  # noqa: F821
FRONTEND_DIR = PROJECT_DIR / "frontend"


def echo(text, stream=sys.stdout):
    # PlatformIO relays this output to a console that may not be UTF-8 on Windows,
    # so drop the characters it cannot encode instead of crashing its reader.
    encoding = locale.getpreferredencoding(False) or "utf-8"
    stream.write(text.encode(encoding, "replace").decode(encoding, "replace"))


def build_frontend(source, target, env):
    if os.environ.get("SKIP_FRONTEND_BUILD"):
        print("SKIP_FRONTEND_BUILD is set. Using the existing data/web/.")
        return

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        sys.stderr.write(
            "pnpm not found on PATH. Install it, or set SKIP_FRONTEND_BUILD=1 "
            "to pack the existing data/web/.\n"
        )
        env.Exit(1)

    if not (FRONTEND_DIR / "node_modules").is_dir():
        sys.stderr.write(
            "frontend/node_modules is missing. Run 'pnpm install --frozen-lockfile' "
            "in frontend/ first.\n"
        )
        env.Exit(1)

    print("Building the frontend with 'pnpm build' in frontend/")
    result = subprocess.run(
        [pnpm, "build"],
        cwd=str(FRONTEND_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    echo(result.stdout)
    echo(result.stderr, sys.stderr)
    if result.returncode != 0:
        sys.stderr.write("'pnpm build' failed. The FS image was not built.\n")
        env.Exit(result.returncode)


env.AddPreAction(  # noqa: F821
    "$BUILD_DIR/${ESP32_FS_IMAGE_NAME}.bin", build_frontend
)
