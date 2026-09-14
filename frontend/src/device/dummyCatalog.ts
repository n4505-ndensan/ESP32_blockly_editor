import type { Device } from "./types";

// PCだけでUIを触るための仮のカタログ。ESP32から配信したときは`GET /api/devices`の結果を使う。
// 部品の定義そのものはファームウェア側（src/devices/devices.cpp）が持つ。
// ここはあくまで見た目を確認するための写しで、食い違っても実機の動作には影響しない。
export const dummyCatalog = (): Device[] => [
  { id: "led_white", label: "白色LED", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "led_red", label: "赤色LED", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "led_green", label: "緑色LED", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "led_yellow", label: "黄色LED", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "led_blue", label: "青色LED", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "buzzer", label: "ブザー", description: "", unit: "", kind: "output", control: "switch", state: { on: false } },
  { id: "temperature", label: "温度", description: "検出範囲の最高温度", unit: "℃", kind: "sensor", control: "none", state: {} },
  { id: "distance", label: "距離", description: "対象物までの距離", unit: "mm", kind: "sensor", control: "none", state: {} },
];

// ダミーのセンサ値。実機と同じ`devices`イベントの形に合わせて返す。
export const dummySensorValues = (tick: number) => [
  { id: "temperature", state: { value: Number((24.5 + Math.sin(tick / 5)).toFixed(2)) } },
  { id: "distance", state: { value: Math.round(300 + 100 * Math.sin(tick / 3)) } },
];
