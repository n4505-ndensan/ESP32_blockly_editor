# ADR 0012: Keep waiting on unusable sensor values and publish the reason

- Status: Accepted
- Date: 2026-10-28
- Gives the reasons for the "no skipping" rule of [ADR 0008](0008-held-distance-value.md),
  adds `reason` to the sensor state of [ADR 0007](0007-sensor-validity.md) and ADR 0008,
  and excludes failed reads from the measurements that postpone a reconnect in [ADR 0011](0011-wait-for-sensor-and-reconnect.md).

## Context

Under ADR 0011 a sensor expression that reads an unusable value waits, and the screen asked the user to check
the connection for every wait. The VL53L1X reports `SignalFail` when nothing is in its field of view
(device status `MSRCNOTARGET`). The firmware held the last value for it until the value aged to `stale`,
and made other optical failures such as `SigmaFail` `unavailable` like I2C failures.
Neither status carried the cause, so an empty field of view paused the program with a message about the connection.
The cause was visible only in the `SENSOR_DIAGNOSTICS` serial log.

The firmware also did not detect a failed read of the VL53L1X results. The Pololu library's `last_status`
reflects only the last write of `read()`, so such a read counted as a measurement and postponed the reconnect.

## Decision

### Waiting is unchanged

Any status other than `ok`/`held` still waits (ADR 0011). The held rules of ADR 0008, the 1000 ms freshness
of ADR 0007 and the reconnect timing of ADR 0011 are unchanged. The engine never reads the reason.

### Reasons

The firmware maps each failure to a device-independent category. The frontend receives only the category,
so adding a device stays a firmware-only change (ADR 0001). Device-specific codes stay in the serial diagnostics.

| Reason | Meaning | Sources |
| --- | --- | --- |
| `no_target` | Measured, but nothing usable in range | VL53L1X `SignalFail`, `OutOfBoundsFail`, `SigmaFail`, `XtalkSignalFail`, `WrapTargetFail` |
| `sensor_fault` | The device reported a fault or an unrecognized result | VL53L1X `HardwareFail`, `MinRangeFail`, `SynchronizationInt`, `None` without the failed-read signature |
| `disconnected` | No communication | Initialization or reconnect failure, VL53L1X `dataReady()` or `read()` write failure, the failed-read signature, AMG8833 transfer failure |
| `no_data` | Communication works but there is no usable value yet | Initialized before the first measurement; a value that aged to `stale` without a failure |

- The API and SSE sensor state is `{value, status, reason}`. `reason` is `null` while the value is usable
  (`ok`, `held`) and one of the categories otherwise.
- A `stale` value keeps the reason of the failure that preceded it, for example `no_target` after `held` expires,
  or `no_data` if there was none.
- A change of `reason` is published even when `status` stays the same.
  Device-specific codes that alternate within one category, such as `SignalFail` and `SigmaFail`, do not add events.
- Category membership changes only the displayed reason, never whether the program waits.
  Which VL53L1X statuses are valid or held is unchanged from ADR 0007 and ADR 0008.

### VL53L1X statuses

| Library status | Device status | Reason | Sample |
| --- | --- | --- | --- |
| `RangeValid` | `RANGECOMPLETE` | — | `ok` |
| `RangeValidNoWrapCheckFail` | `RANGECOMPLETE`, stream count 0 | — | `ok` |
| `RangeValidMinRangeClipped` | `MINCLIP` | — | `ok` |
| `SignalFail` | `MSRCNOTARGET` | `no_target` | `held` while the last value is usable, else status unchanged |
| `WrapTargetFail` | `PHASECONSISTENCY` | `no_target` | `held` while the last value is usable, else status unchanged |
| `SigmaFail` | `SIGMATHRESHOLDCHECK` | `no_target` | `unavailable` |
| `OutOfBoundsFail` | `RANGEPHASECHECK` | `no_target` | `unavailable` |
| `XtalkSignalFail` | `RANGEIGNORETHRESHOLD` | `no_target` | `unavailable` |
| `HardwareFail` | VCSEL and VHV failures, `MULTCLIPFAIL` | `sensor_fault` | `unavailable` |
| `MinRangeFail` | `USERROICLIP` | `sensor_fault` | `unavailable` |
| `SynchronizationInt` | `GPHSTREAMCOUNT0READY` | `sensor_fault` | `unavailable` |
| `None` | Any raw value the library does not map | `sensor_fault`, or `disconnected` for the signature below | `unavailable` |

`MinRangeFail` is a region-of-interest clip. The firmware never changes the region of interest,
so the status is not expected and is treated as a fault rather than as a missing target.

### Detecting a failed results read

In the arduino-esp32 core an I2C read returns every requested byte or none: `i2cRead` sets the count to 0 on error,
and `Wire.read()` then returns -1. A failed `readResults()` therefore leaves every result byte `0xFF`:

- `range_status` is `None` (raw `0xFF` has no mapping),
- `range_mm` is 64351 (`(0xFFFF * 2011 + 0x400) / 0x800`),
- `peak_signal_count_rate_MCPS` and `ambient_count_rate_MCPS` are `0xFFFF / 128`.

`last_status` is still 0 because `read()` ends with a successful interrupt-clear write.
This signature is `disconnected` and does not count as a measurement for the reconnect of ADR 0011.
The core behavior was verified in arduino-esp32 2.0.17 (`cores/esp32/esp32-hal-i2c.c` `i2cRead`,
`libraries/Wire/src/Wire.cpp` `TwoWire::read`). A core update that changes either function invalidates the signature.
The classification does not depend on `Wire`, so it is tested on PC. The library is not forked.

### Display

- The sensor panel shows `--` and a caption for the reason.
- The wait message names the sensor and its reason, read from the device state. The run state does not duplicate it.
- `disconnected` and `sensor_fault` are shown as errors while waiting.
  `no_target` and `no_data` are shown as plain status text, because the program is paused and the user needs to know why.

## Rejected alternative: skip conditions that have no value

Treating "no target" as a normal absence and skipping the condition that reads it was examined and rejected.

- If comparisons with no value are false, `not (d < 100)` and `d >= 100` disagree.
- If the condition is skipped instead, each construct needs its own rule: if/else (neither branch, or else),
  while, until (compiled by the frontend as `while not(...)`), and repeat with a sensor count.
- No value would have to propagate through arithmetic, where a non-finite result is `arithmetic_error`,
  and through logic, either as plain propagation or as three-valued logic.
- The value stack holds finite doubles only, and `Devices::read` returns a bool, so both would change.

Waiting on any unusable value is one rule. Execution order stays the same and none of the above needs deciding.

## Consequences

- A distance sensor without a target pauses the whole program, including parts that do not depend on it.
  The screen states that no target is in range.
- A VL53L1X whose results read keeps failing is initialized again after 1000 ms, like one whose writes fail.
- A failed results read also feeds `0xFFFF` values to the library's `updateDSS()`. The next good read recomputes them.
- A failed `dataReady()` read whose register write succeeded reads as "not ready". The value ages to `stale`
  with `no_data`, and the reconnect of ADR 0011 handles it.
- Firmware without `reason` makes the screen fall back to captions by status.
- With `SENSOR_DIAGNOSTICS`, the `SENSOR` log carries `category` (the published reason) and reports
  the failed-read signature as `read_results_i2c`.
