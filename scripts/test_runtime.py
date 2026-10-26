"""Run the ESP32's hardware-independent Unity tests on Windows (VS C++ tools)."""
import os
from pathlib import Path
import subprocess
import urllib.request

root = Path(__file__).resolve().parents[1]
out = root / ".pio" / "native-tests"
out.mkdir(parents=True, exist_ok=True)
unity = out / "unity"
unity.mkdir(exist_ok=True)
for name in ("unity.c", "unity.h", "unity_internals.h"):
    target = unity / name
    if not target.exists():
        with urllib.request.urlopen(f"https://raw.githubusercontent.com/ThrowTheSwitch/Unity/v2.6.1/src/{name}", timeout=30) as response:
            target.write_bytes(response.read())
fixtures = (root / "shared/program-fixtures.json").read_text(encoding="utf-8")
(out / "program_fixtures.h").write_text('#pragma once\nstatic const char PROGRAM_FIXTURES[] = R"fixtures(' + fixtures + ')fixtures";\n', encoding="utf-8")
vswhere = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft Visual Studio/Installer/vswhere.exe"
vs = subprocess.check_output([str(vswhere), "-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], text=True).strip()
if not vs:
    raise SystemExit("Install Visual Studio C++ build tools, or use pio test -e runtime_test with an ESP32.")
devcmd = Path(vs) / "Common7/Tools/VsDevCmd.bat"
# Capture the toolchain environment internally; do not log environment variables.
environment_text = subprocess.check_output(f'"{devcmd}" -no_logo -arch=x64 >nul && set', shell=True, text=True, errors="replace")
environment = dict(os.environ)
for line in environment_text.splitlines():
    key, sep, value = line.partition("=")
    if sep and key:
        environment[key] = value
include = root / ".pio/libdeps/esp32dev/ArduinoJson/src"
if not include.exists():
    raise SystemExit("First install the project's PlatformIO ArduinoJson dependency.")
sources = [root / "src/runtime/program.cpp", root / "src/runtime/engine.cpp", root / "src/devices/device_settings.cpp", root / "test/test_runtime/test_main.cpp", unity / "unity.c"]
args = ["cl", "/nologo", "/std:c++17", "/EHsc", "/utf-8", "/W3", "/D_CRT_SECURE_NO_WARNINGS", f"/I{root / 'src'}", f"/I{include}", f"/I{unity}", f"/I{out}", *map(str, sources), "/Fe:runtime_tests.exe"]
subprocess.run(args, env=environment, cwd=out, check=True)
subprocess.run([str(out / "runtime_tests.exe")], cwd=out, check=True)
