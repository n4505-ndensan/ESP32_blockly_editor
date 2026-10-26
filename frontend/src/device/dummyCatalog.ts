import type { Device } from "~/device/types";
import type { Part } from "~/settings/types";

// PCだけでUIを触るための仮の部品リスト。ESP32から配信したときは`GET /api/devices`の結果を使う。
// 部品リストの初期値はファームウェア側（src/devices/devices.cpp）が持つ。
// ここはあくまで見た目を確認するための写しで、食い違っても実機の動作には影響しない。
export const dummyParts: Part[] = [
  { id: "led_white", type: "led", label: "白色LED", pins: [18] },
  { id: "led_red", type: "led", label: "赤色LED", pins: [5] },
  { id: "led_green", type: "led", label: "緑色LED", pins: [17] },
  { id: "led_yellow", type: "led", label: "黄色LED", pins: [16] },
  { id: "led_blue", type: "led", label: "青色LED", pins: [4] },
  { id: "buzzer", type: "buzzer", label: "ブザー", pins: [23] },
  { id: "temperature", type: "thermo", label: "温度", pins: [21, 22] },
  { id: "distance", type: "tof", label: "距離", pins: [21, 22] },
];

/** 部品リストの1行をカタログ1件にする。説明・単位は種類で決まる。 */
export const partDevice = ({ id, type, label }: Part): Device => {
  if (type === "thermo")
    return {
      id,
      label,
      type,
      unit: "℃",
      kind: "sensor",
      control: "none",
      state: {},
    };
  if (type === "tof")
    return {
      id,
      label,
      type,
      unit: "mm",
      kind: "sensor",
      control: "none",
      state: {},
    };
  return {
    id,
    label,
    type,
    unit: "",
    kind: "output",
    control: "switch",
    state: { on: false },
  };
};

export const dummyCatalog = (): Device[] => dummyParts.map(partDevice);

// ダミーのセンサ値。実機と同じ`devices`イベントの形に合わせて返す。
// 設定画面で足したセンサにも配れるよう、IDではなく種類で値の作り方を決める。
export const dummySensorValues = (tick: number, devices: readonly Device[]) =>
  devices
    .filter((device) => device.kind === "sensor")
    .map((device) => ({
      id: device.id,
      state: {
        value:
          device.type === "thermo"
            ? Number((24.5 + Math.sin(tick / 5)).toFixed(2))
            : Math.round(300 + 100 * Math.sin(tick / 3)),
        status: "ok" as const,
      },
    }));
