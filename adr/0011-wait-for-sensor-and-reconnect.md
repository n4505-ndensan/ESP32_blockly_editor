# ADR 0011: Wait for an unusable sensor and reconnect it

- Status: Partially replaced by [ADR 0012](0012-sensor-failure-reasons.md) (failed reads, wait message)
- Date: 2026-10-28
- Replaces the parts of [ADR 0007](0007-sensor-validity.md) and [ADR 0008](0008-held-distance-value.md)
  that end a run when a sensor expression reads an unusable value, and the parts of
  [ADR 0002](0002-nonblocking-distance-sampling.md) and ADR 0007 that recover from a failed initialization only by rebooting.

## Context

A sensor expression that read an `unavailable` or `stale` value ended the run with `sensor_unavailable`
and turned all outputs off. The run did not resume when the sensor recovered.
A sensor that failed its boot initialization, stopped ranging after a reset, or stopped answering on the bus
stayed unusable until the board rebooted. A loose or re-seated sensor therefore stopped the program for good.

## Decision

### Runtime

- When a sensor expression reads a value that is neither `ok` nor `held`, the engine stays on that instruction,
  yields, and reads again on the next tick. Nothing has been pushed yet, so the expression resumes intact.
- Both `unavailable` and `stale` wait. Each covers lost connections as well as other failures,
  so waiting on only one of them would stop or wait depending on the failure path rather than its severity.
- Outputs keep their state while waiting. The wait has no time limit. STOP behaves as before.
- Sensors that are not read, including those skipped by short-circuit evaluation, never cause a wait.
- The run state carries `waiting: {deviceId, blockId} | null`. A change of it increments `revision`.
  The screen names the sensor being waited on and highlights its block.

### Sensors

- A sensor that has delivered no measurement over I2C for 1000 ms is initialized again, at most once per 1000 ms.
  This covers a failed boot initialization, a failing bus, and a VL53L1X that stopped ranging after a reset.
  Optical ranging failures still deliver measurements and do not trigger it.
- VL53L1X: `stopContinuous()`, `init()` with a 20 ms boot timeout, then `startContinuous(100)`.
  `stopContinuous()` also clears the library's calibration flag, which `init()` keeps.
- AMG8833: the register writes of Adafruit's `begin()`, then 100 ms without reads instead of its `delay(100)`.
- A failed attempt marks the sensor `unavailable`.
- The validity rules of ADR 0007 and ADR 0008 (`ok`, `held`, `unavailable`, `stale`, the held conditions,
  the 1000 ms freshness) are unchanged.

## Consequences

- A program can stand still indefinitely with outputs on, for example a buzzer, while a sensor is missing.
  The screen shows the wait, and STOP turns all outputs off.
- `sensor_unavailable` is no longer reported.
- An attempt runs in `loop()`. STOP and SSE are delayed by its I2C transactions, which are bounded by
  the 10 ms bus timeout per transaction and the 20 ms boot timeout.
- Initializing again does not release a bus that a device holds low, and plugging a sensor in while powered
  can reset the board through a supply dip. Both still need a power cycle or a reboot.
- With `SENSOR_DIAGNOSTICS`, `SENSOR_RECONNECT` logs each attempt and `SENSOR_RUNTIME` logs the start (`wait`)
  and end (`resume`, or `stop` for STOP) of a wait.
