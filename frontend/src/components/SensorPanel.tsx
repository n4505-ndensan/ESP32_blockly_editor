import { For, Show } from "solid-js";
import type { DeviceStore } from "../device/createDeviceStore";

export default function SensorPanel(props: { store: DeviceStore }) {
  const sensors = () =>
    props.store.devices.filter((device) => device.kind === "sensor");
  const connected = () =>
    props.store.source === "dummy" || props.store.status() === "接続済み";

  return (
    <aside class="sensor-panel panel" aria-labelledby="sensor-title">
      <div class="panel-heading">
        <h2 id="sensor-title">センサ</h2>
      </div>

      <div class="sensor-readings">
        <For each={sensors()}>
          {(device) => (
            <section
              class="sensor-reading"
              aria-labelledby={`${device.id}-label`}
            >
              <h3 id={`${device.id}-label`}>
                <span class={`sensor-mark ${device.id}-mark`} />
                {device.label}
              </h3>
              <p class="sensor-value">
                <span id={device.id}>{device.state.value ?? "--"}</span>
                <span class="unit">{device.unit}</span>
              </p>
              <Show when={device.description}>
                <p class="sensor-caption">{device.description}</p>
              </Show>
            </section>
          )}
        </For>
      </div>

      <div class="sensor-status" role="status">
        <span
          class="status-dot"
          classList={{ "status-dot-ready": connected() }}
        />
        {props.store.status()}
      </div>
    </aside>
  );
}
