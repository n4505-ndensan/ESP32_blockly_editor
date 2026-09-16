import { createMemo, For, Show } from "solid-js";
import { sensorPresentation } from "../device/sensorPresentation";
import { deviceSource, DeviceStatus, deviceStore } from "../store/deviceStore";

export default function SensorPanel() {
  const sensors = () =>
    deviceStore.devices.filter((device) => device.kind === "sensor");
  const connected = () =>
    deviceSource === "dummy" ||
    deviceStore.status === DeviceStatus.LOCAL_DEV_DUMMY;

  return (
    <aside class="sensor-panel panel" aria-labelledby="sensor-title">
      <div class="panel-heading">
        <h2 id="sensor-title">Sensor / センサー</h2>
      </div>

      <div class="sensor-readings">
        <For each={sensors()}>
          {(device) => {
            const presentation = createMemo(() =>
              sensorPresentation(device.id, device.state),
            );
            return (
              <section
                class="sensor-reading"
                aria-labelledby={`${device.id}-label`}
              >
                <h3 id={`${device.id}-label`}>
                  <span class={`sensor-mark ${device.id}-mark`} />
                  {device.label}
                  <Show when={device.description}>
                    <span class="sensor-caption">{device.description}</span>
                  </Show>
                </h3>
                <p class="sensor-value">
                  <span id={device.id}>{presentation().value}</span>
                  <span class="unit">{device.unit}</span>
                </p>
                <Show when={presentation().caption}>
                  <p class="sensor-caption">{presentation().caption}</p>
                </Show>
                <Show when={device.description}>
                  <p class="sensor-caption">{device.description}</p>
                </Show>
              </section>
            );
          }}
        </For>
      </div>

      <Show when={deviceStore.status !== DeviceStatus.CONNECTED}>
        <div class="sensor-status" role="status">
          <span
            class="status-dot"
            classList={{ "status-dot-ready": connected() }}
          />
          {deviceStore.status}
        </div>
      </Show>
    </aside>
  );
}
