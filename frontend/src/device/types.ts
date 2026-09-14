// ESP32の`GET /api/devices`・`devices`イベントとそろえた型。
// 仕様はadr/0001-device-state-and-control.mdを参照。

export type DeviceKind = "output" | "sensor";
export type DeviceControl = "none" | "switch";

/** 出力部品は`on`、センサは`value`だけを持つ。 */
export type DeviceState = {
  on?: boolean;
  value?: number;
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
  devices: { id: string; state: DeviceState }[];
};

export const isSwitchable = (device: Device) => device.control === "switch";
export const isSensor = (device: Device) => device.kind === "sensor";
