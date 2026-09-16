// ESP32の`GET /api/devices`・`devices`イベントとそろえた型。
// 仕様はadr/0001-device-state-and-control.mdを参照。

export type DeviceKind = "output" | "sensor";
export type DeviceControl = "none" | "switch";

/** 無効なセンサ値は0ではなくnull。 */
export type DeviceState = {
  on?: boolean;
  value?: number | null;
  status?: "ok" | "unavailable" | "stale";
};

/** カタログ1件。静的な定義と、その時点の状態。 */
export type Device = {
  id: string;
  label: string;
  description: string;
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
