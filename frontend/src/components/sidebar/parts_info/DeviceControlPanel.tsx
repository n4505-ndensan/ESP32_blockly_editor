import { css } from "@acab/ecsstatic";
import { For, Show } from "solid-js";
import { ghostButton, panel, panelHeading } from "~/components/styles";
import { setOutput, turnAllOff } from "~/device/actions";
import { manualBlocked } from "~/program/actions";
import { deviceSource, deviceStore, isPending } from "~/store/deviceStore";
import { programBusy, programStore } from "~/store/programStore";

const deviceHeading = css`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const deviceList = css`
  margin: 0;
  padding: 0 24px;
  list-style: none;

  @media (max-width: 900px) {
    padding-inline: 20px;
  }
  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;
  }
`;

const deviceEmpty = css`
  padding: 12px 0;
  border-top: 1px solid #edf0ee;
  color: #7b8b81;
`;

const deviceRow = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid #edf0ee;
`;

const deviceLabel = css`
  font-size: 12px;
`;

// The track and thumb react to the switch's aria-checked and focus in their own classes.
const deviceSwitch = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: #7b8b81;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  /* 送信中はESP32の応答待ち。確定するまで表示を変えない。 */
  &:disabled {
    cursor: progress;
    opacity: 0.55;
  }
  &[aria-checked="true"] {
    color: #2f6a51;
  }
  &:focus-visible {
    outline: none;
  }
`;

const deviceSwitchText = css`
  width: 2.4em;
  text-align: left;
`;

const deviceSwitchTrack = css`
  position: relative;
  width: 34px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 9px;
  background: #d7dfda;
  transition: background 120ms ease;

  [aria-checked="true"] > & {
    background: #438568;
  }
  :focus-visible > & {
    outline: 2px solid #438568;
    outline-offset: 2px;
  }
`;

const deviceSwitchThumb = css`
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px #20382d33;
  transition: transform 120ms ease;

  [aria-checked="true"] & {
    transform: translateX(16px);
  }
`;

const deviceError = css`
  padding: 10px 24px;
  border-top: 1px solid #f0ded9;
  background: #fbf1ef;
  color: #9d4b3f;
  font-size: 12px;

  @media (max-width: 900px) {
    padding-inline: 20px;
  }
`;

export default function DeviceControlPanel() {
  const outputs = () =>
    deviceStore.devices.filter((device) => device.control === "switch");
  const anyOn = () => outputs().some((device) => device.state.on === true);

  return (
    <aside class={panel} aria-labelledby="device-title">
      <div class={`${panelHeading} ${deviceHeading}`}>
        <div>
          <h2 id="device-title">Parts</h2>
        </div>

        <button
          type="button"
          class={ghostButton}
          disabled={
            !anyOn() &&
            !programBusy() &&
            (deviceSource === "dummy" || programStore.known)
          }
          onClick={() => void turnAllOff()}
        >
          すべて消す
        </button>
      </div>

      <ul class={deviceList}>
        <For
          each={outputs()}
          fallback={<li class={deviceEmpty}>部品を読み込んでいます…</li>}
        >
          {(device) => {
            const on = () => device.state.on === true;
            const pending = () => isPending(device.id);

            return (
              <li class={deviceRow}>
                <span class={deviceLabel}>{device.label}</span>
                <button
                  type="button"
                  role="switch"
                  class={deviceSwitch}
                  aria-checked={on()}
                  aria-label={`${device.label}を${on() ? "消す" : "つける"}`}
                  disabled={pending() || manualBlocked()}
                  // 表示中の状態から「したい状態」を決めて送る。反転はESP32側に任せない。
                  onClick={() => void setOutput(device.id, !on())}
                >
                  <span class={deviceSwitchTrack}>
                    <span class={deviceSwitchThumb} />
                  </span>
                  <span class={deviceSwitchText}>{on() ? "ON" : "OFF"}</span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>

      <Show when={deviceStore.error}>
        {(message) => (
          <p class={deviceError} role="alert">
            {message()}
          </p>
        )}
      </Show>
    </aside>
  );
}
