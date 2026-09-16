import { createMemo, For, Show } from "solid-js";
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
            const value = createMemo(() =>
              device.state.status !== "ok" ? null : device.id !== "temperature"
                ? device.state.value
                : device.state.value?.toFixed(2),
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
                  <span id={device.id}>{value() ?? "--"}</span>
                  <span class="unit">{device.unit}</span>
                </p>
                <Show when={device.state.status !== "ok"}>
                  <p class="sensor-caption">{device.state.status === "stale" ? "値が更新されていません" : "取得できません"}</p>
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
