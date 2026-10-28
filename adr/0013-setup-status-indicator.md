# ADR 0013: Report setup progress and failures with the kit LEDs and buzzer

- Status: Accepted
- Date: 2026-10-28
- Replaces the power-on signal of [ADR 0001](0001-device-state-and-control.md) section 6,
  which turned all outputs on briefly at boot. Outputs still start off.

## Context

The web UI is reachable only after setup has connected to WiFi and started the web server.
Before this decision the board showed nothing of setup apart from the serial log: the power-on signal lit
every output once, and setup then waited for WiFi without a time limit.
A board that could not join the network, could not mount LittleFS, or had a sensor that failed to initialize
looked the same as one that was still booting unless a serial monitor was attached.

## Decision

### Parts

- The indicator uses the kit parts `led_white`, `led_blue`, `led_green`, `led_red`, `led_yellow` and `buzzer`.
  Setup looks each one up by ID in `defaultPartList()` and takes its default pin. The lookup stays in the setup code.
- Each signal is driven with `setDeviceOutput()` on the part in the active part list that uses that pin,
  so the web UI shows the same state. If no active part uses the pin, that signal is skipped.
- The kit is assumed to be wired on the default pins.

### Signals

| Phase | Buzzer | LED |
| --- | --- | --- |
| Connecting to WiFi | — | White and blue alternate every 500 ms |
| All setup steps succeeded | On for 400 ms | Green on for 1000 ms, then off |
| One or more steps failed | 3 × (200 ms on, 200 ms off) | Failure LEDs stay on (see below) |

- The buzzer pattern plays once per boot, regardless of how many steps failed.
- The success signal finishes before `server.begin()`, with all outputs off.
- `initDevices()` no longer turns all outputs on as a power-on signal. It still turns all outputs off before continuing.

### Failures

| Step | LED | After the failure |
| --- | --- | --- |
| WiFi: not connected within 30 s | Red | Setup stops. The web server is not started. |
| LittleFS mount | Yellow | Setup stops. The web server is not started. |
| mDNS start | Yellow | Setup continues and starts the web server. |
| Initialization of a sensor in the part list | Yellow | Setup continues and starts the web server. |

- Red and yellow have separate causes and are lit independently. Both are lit when both kinds of failure occur.
- When setup stops, the failure signal plays at that point. Otherwise it plays before `server.begin()`.
- A failure LED stays on until a program starts (`Engine::start()` turns all outputs off) or the LED is operated manually.
  A sensor that recovers later ([ADR 0011](0011-wait-for-sensor-and-reconnect.md)) does not turn it off.

### WiFi connection

- The connection wait times out after 30 s. Reconnects that the Arduino core performs within that window are allowed.
- On timeout, setup calls `WiFi.disconnect(true)` and makes no further attempts until the next boot.
- Disconnections after a successful connection are out of scope.

## Consequences

- A board that cannot join the network needs a reboot to try again.
- When setup stops, nothing can start a program or operate an output, so the failure LEDs stay on until the next boot.
- Yellow does not tell its causes apart. The serial log does, and the web UI shows a failed sensor as `disconnected`
  ([ADR 0012](0012-sensor-failure-reasons.md)).
- An output that the active part list places on a kit pin is driven by that pin's signal, whatever its ID or type.
- Setup takes 1000 ms longer on success and 1200 ms longer on failure.
