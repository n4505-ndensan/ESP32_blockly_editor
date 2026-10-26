import type { DeviceState } from "~/device/types";
import type { PartType } from "~/settings/types";

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
      : state.status === "stale"
        ? "値が更新されていません"
        : "取得できません",
  };
}
