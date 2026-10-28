# Setup status indicator

The web UI is not reachable until boot setup finishes, so the kit LEDs and buzzer report the progress and result of setup.
The reasons for this design are recorded in [ADR 0013](../adr/0013-setup-status-indicator.md).

## Parts

- The indicator uses the kit parts `led_white`, `led_blue`, `led_green`, `led_red`, `led_yellow` and `buzzer`.
  Setup looks each one up by ID in `defaultPartList()` and takes its default pin.
- Each signal is driven with `setDeviceOutput()` on the LED or buzzer in the active part list that uses that pin,
  so the web UI shows the same state. If no LED or buzzer in the active part list uses the pin, that signal is skipped.
- The kit is assumed to be wired on the default pins.

## Signals

| Phase | Buzzer | LED |
| --- | --- | --- |
| Connecting to WiFi | — | White and blue alternate every 500 ms |
| All setup steps succeeded | On for 400 ms | Green on for 1000 ms, then off |
| One or more steps failed | 3 × (200 ms on, 200 ms off) | Failure LEDs stay on (see below) |

- All outputs are off when setup starts. No signal lights every output at power-on.
- The buzzer pattern plays once per boot, regardless of how many steps failed.
- The success signal ends with all outputs off before the web server starts.

## Failures

| Step | LED | After the failure |
| --- | --- | --- |
| WiFi: not connected within 30 s | Red | Setup stops. The web server is not started. |
| LittleFS mount | Yellow | Setup stops. The web server is not started. |
| mDNS start | Yellow | Setup continues and starts the web server. |
| Initialization of a sensor in the part list | Yellow | Setup continues and starts the web server. |

- Red and yellow have separate causes and are lit independently. Both are lit when both kinds of failure occur.
- When setup stops, the failure signal plays at that point. Otherwise it plays before the web server starts.
- A failure LED stays on until a program starts (`Engine::start()` turns all outputs off) or the LED is switched manually.
  When setup has stopped, neither is possible, so the LED stays on until the next boot.
  A sensor that recovers later ([ADR 0011](../adr/0011-wait-for-sensor-and-reconnect.md)) does not turn it off.

## WiFi connection

- The connection wait times out after 30 s. Within that window the Arduino core may retry on its own;
  setup does not call `WiFi.begin()` again.
- On timeout, setup calls `WiFi.disconnect(true)`, which also turns the station off, and does not retry until the next boot.
- A disconnection after the connection has succeeded is not indicated.
