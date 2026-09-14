import { For, Show } from "solid-js";
import { deviceStore, isPending } from "../store/deviceStore";
import { setOutput, turnAllOff } from "../device/actions";

export default function DeviceDirectControlPanel() {
  const outputs = () =>
    deviceStore.devices.filter((device) => device.control === "switch");
  const anyOn = () => outputs().some((device) => device.state.on === true);

  return (
    <aside class="device-panel panel" aria-labelledby="device-title">
      <div class="panel-heading device-heading">
        <div>
          <h2 id="device-title">部品</h2>
        </div>
        <button
          type="button"
          class="ghost-button"
          disabled={!anyOn()}
          onClick={() => void turnAllOff()}
        >
          すべて消す
        </button>
      </div>

      <ul class="device-list">
        <For
          each={outputs()}
          fallback={<li class="device-empty">部品を読み込んでいます…</li>}
        >
          {(device) => {
            const on = () => device.state.on === true;
            const pending = () => isPending(device.id);

            return (
              <li class="device-row">
                <span class="device-label">{device.label}</span>
                <button
                  type="button"
                  role="switch"
                  class="device-switch"
                  classList={{
                    "device-switch-on": on(),
                    "device-switch-pending": pending(),
                  }}
                  aria-checked={on()}
                  aria-label={`${device.label}を${on() ? "消す" : "つける"}`}
                  disabled={pending()}
                  // 表示中の状態から「したい状態」を決めて送る。反転はESP32側に任せない。
                  onClick={() => void setOutput(device.id, !on())}
                >
                  <span class="device-switch-track">
                    <span class="device-switch-thumb" />
                  </span>
                  <span class="device-switch-text">{on() ? "ON" : "OFF"}</span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>

      <Show when={deviceStore.error}>
        {(message) => (
          <p class="device-error" role="alert">
            {message()}
          </p>
        )}
      </Show>

      <p class="device-note">
        ブロックの実行を始めると、この状態はプログラム側から書き換わります。
      </p>
    </aside>
  );
}
