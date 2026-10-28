import type { DeviceState, SensorReason } from "~/device/types";
import type { PartType } from "~/settings/types";

const reasonCaptions: Record<SensorReason, string> = {
  no_target: "範囲内に対象物がありません",
  sensor_fault: "センサが異常を報告しています",
  disconnected: "センサと通信できません",
  no_data: "測定値が届いていません",
};

/** 表示だけを変換する。値の保持・鮮度判定はESP32に任せる。heldもokと同じく値だけを出す。 */
export function sensorPresentation(type: PartType, state: DeviceState) {
  const usable = state.status === "ok" || state.status === "held";
  return {
    value:
      usable && state.value != null
        ? type === "thermo"
          ? state.value.toFixed(2)
          : state.value
        : "--",
    caption: usable
      ? null
      : // Without a known reason: older firmware, or the connection to the board was lost.
        (state.reason && reasonCaptions[state.reason]) ||
        (state.status === "stale"
          ? "値が更新されていません"
          : "取得できません"),
  };
}

/** Top bar message while a running program waits on a sensor. Faults are shown as errors. */
export function sensorWaitPresentation(
  label: string,
  reason: SensorReason | null | undefined,
) {
  switch (reason) {
    case "disconnected":
      return {
        text: `「${label}」と通信できないため、値を待っています。センサの接続を確認してください。`,
        error: true,
      };
    case "sensor_fault":
      return {
        text: `「${label}」が異常を報告しているため、値を待っています。センサを確認してください。`,
        error: true,
      };
    case "no_target":
      return {
        text: `「${label}」の範囲内に対象物がないため、値を待っています。`,
        error: false,
      };
    default:
      return { text: `「${label}」の値を待っています。`, error: false };
  }
}
