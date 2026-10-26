import { css } from "@acab/ecsstatic";
import { createMemo, For, Show } from "solid-js";
import { sensorPresentation } from "../device/sensorPresentation";
import type { PartType } from "../settings/types";
import { deviceSource, DeviceStatus, deviceStore } from "../store/deviceStore";
import { panel, panelHeading } from "./styles";

export default function SensorPanel() {
  const sensors = () =>
    deviceStore.devices.filter((device) => device.kind === "sensor");
  const connected = () =>
    deviceSource === "dummy" ||
    deviceStore.status === DeviceStatus.LOCAL_DEV_DUMMY;

  return (
    <aside class={panel} aria-labelledby="sensor-title">
      <div class={panelHeading}>
        <h2 id="sensor-title">Sensor / センサー</h2>
      </div>

      <div class={sensorReadings}>
        <For each={sensors()}>
          {(device) => {
            const presentation = createMemo(() =>
              sensorPresentation(device.type, device.state),
            );
            return (
              <section
                class={sensorReading}
                aria-labelledby={`${device.id}-label`}
              >
                <h3 id={`${device.id}-label`}>
                  <span class={`${sensorMark} ${sensorMarkColors[device.type] ?? ""}`} />
                  {device.label}
                </h3>
                <p class={sensorValue}>
                  <span id={device.id}>{presentation().value}</span>
                  <span class={unit}>{device.unit}</span>
                </p>
                <Show when={presentation().caption}>
                  <p class={sensorCaption}>{presentation().caption}</p>
                </Show>
              </section>
            );
          }}
        </For>
      </div>

      <Show when={deviceStore.status !== DeviceStatus.CONNECTED}>
        <div class={sensorStatus} role="status">
          <span
            class={statusDot}
            classList={{ [statusDotReady]: connected() }}
          />
          {deviceStore.status}
        </div>
      </Show>
    </aside>
  );
}

const sensorReadings = css`
  padding: 0 24px;

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding: 0 20px;
  }
`;

const sensorReading = css`
  display: flex;
  padding: 8px 0;
  border-top: 1px solid #edf0ee;

  & h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
  }

  @media (max-width: 720px) {
    padding: 12px 0 16px;
  }
`;

const sensorCaption = css`
  color: #6d7d73;
  font-size: 11px;
  margin-left: auto;
`;

const sensorMark = css`
  width: 12px;
  height: 12px;
  border-radius: 2px;
`;

const sensorMarkColors: Partial<Record<PartType, string>> = {
  thermo: css`
    background: #c87c59;
  `,
  tof: css`
    background: #5a8ca8;
  `,
};

const sensorValue = css`
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-left: auto;
  margin-right: 6px;
  font-size: 24px;
  font-weight: 550;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;

  @media (max-width: 720px) {
    font-size: clamp(24px, 7vw, 34px);
  }
`;

const unit = css`
  color: #75857b;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
`;

const sensorStatus = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid #edf0ee;
  color: #63786b;
  font-size: 12px;

  @media (max-width: 720px) {
    padding: 10px 20px;
  }
`;

const statusDot = css`
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #b88738;
`;

/** Overrides the statusDot background, so it must stay after statusDot. */
const statusDotReady = css`
  background: #438568;
`;
