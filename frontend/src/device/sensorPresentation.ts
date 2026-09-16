import type { DeviceState } from "./types";

/** 表示だけを変換する。値の保持・鮮度判定はESP32に任せる。 */
export function sensorPresentation(id: string, state: DeviceState) {
  const usable = state.status === "ok" || state.status === "held";
  return {
    value:
      usable && state.value != null
        ? id === "temperature"
          ? state.value.toFixed(2)
          : state.value
        : "--",
    caption:
      state.status === "held"
        ? "直近値を使用中"
        : state.status === "ok"
          ? null
          : state.status === "stale"
            ? "値が更新されていません"
            : "取得できません",
  };
}
