# ADR 0010: Give the second app slot to LittleFS

- Status: Accepted
- Date: 2026-10-27
- Replaces the part of [ADR 0004](0004-littlefs-web-storage.md) that keeps the default partition layout.

## Context

The default `esp32dev` layout has two 1.25 MiB app slots for OTA updates and a 1.375 MiB `spiffs` partition
for the web assets. The firmware has no OTA path (`Update`, `ArduinoOTA`), so the second slot is never used.

When this decision was made, the packed web assets needed about 342 of the 352 file system blocks.
`mklittlefs` exits with status 0 when the image is full and drops or truncates the remaining files,
so an overflow passes `buildfs` and `uploadfs` and only shows up as missing files on the board.

## Decision

All environments use `partitions.csv` at the repository root.

| Name       | Type / SubType  | Offset     | Size                 |
| ---------- | --------------- | ---------- | -------------------- |
| `nvs`      | data / nvs      | `0x9000`   | `0x5000` (unchanged) |
| `otadata`  | data / ota      | `0xe000`   | `0x2000` (unchanged) |
| `app0`     | app / ota_0     | `0x10000`  | `0x180000` (1.5 MiB) |
| `spiffs`   | data / spiffs   | `0x190000` | `0x260000` (2.375 MiB) |
| `coredump` | data / coredump | `0x3F0000` | `0x10000` (unchanged) |

The layout follows Arduino-ESP32's bundled `no_ota.csv` and moves only the boundary between the app
and the file system. `no_ota.csv` gives the app 2 MiB; this layout gives the file system most of the freed space
because the web assets (Blockly, fonts, images) grow faster than the firmware.
The partition keeps the name `spiffs`, which Arduino-ESP32 2.x LittleFS mounts by default.

## Consequences

- Firmware cannot be updated over the network. Writing the default layout over USB restores that option.
- `nvs` keeps its offset and size, so the saved part list ([ADR 0009](0009-device-list-settings.md)) survives the change.
- Moving a board to this layout requires both `upload` (writes the partition table) and `uploadfs`.
  The image at the old offset is not reused.
- The build still does not detect a file system overflow. This layout only enlarges the margin.
