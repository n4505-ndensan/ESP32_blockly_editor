"""Embed the same JSON fixtures Vitest reads into the ESP32 Unity test build."""
from pathlib import Path

Import("env")  # noqa: F821
root = Path(env.subst("$PROJECT_DIR"))  # noqa: F821
target = root / ".pio" / "fixtures"
target.mkdir(parents=True, exist_ok=True)
fixtures = (root / "shared" / "program-fixtures.json").read_text(encoding="utf-8")
(target / "program_fixtures.h").write_text(
    '#pragma once\nstatic const char PROGRAM_FIXTURES[] = R"fixtures(' + fixtures + ')fixtures";\n', encoding="utf-8"
)
env.Append(CPPPATH=[str(target)])  # noqa: F821
