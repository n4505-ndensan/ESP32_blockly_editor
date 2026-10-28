import type { PartType } from "~/settings/types";

// ESP32の`GET /api/devices`・`devices`イベントとそろえた型。
// 仕様はadr/0001-device-state-and-control.md、adr/0008-held-distance-value.md、
// adr/0012-sensor-failure-reasons.mdを参照。

export type DeviceKind = "output" | "sensor";
export type DeviceControl = "none" | "switch";

/** Why a sensor value is not usable. The firmware maps device-specific codes to these (ADR 0012). */
export type SensorReason =
  "no_target" | "sensor_fault" | "disconnected" | "no_data";

/** ok/heldは数値を持ち、無効なセンサ値は0ではなくnull。 */
export type DeviceState = {
  on?: boolean;
  value?: number | null;
  status?: "ok" | "held" | "unavailable" | "stale";
  /** Set only while the value is not usable. Absent from firmware that predates reasons. */
  reason?: SensorReason | null;
};

/** カタログ1件。静的な定義と、その時点の状態。 */
export type Device = {
  id: string;
  label: string;
  /** 部品リストの種類。表示の色や桁数を種類で決める。 */
  type: PartType;
  unit: string;
  kind: DeviceKind;
  control: DeviceControl;
  state: DeviceState;
};

/** SSEの`devices`イベント、および接続直後のスナップショット。 */
export type DeviceStateEvent = {
  ts: number;
  bootId: string;
  revision: number;
  devices: { id: string; state: DeviceState }[];
};

export const isSwitchable = (device: Device) => device.control === "switch";
export const isSensor = (device: Device) => device.kind === "sensor";
