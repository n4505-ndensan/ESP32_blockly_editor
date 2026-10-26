// 部品リスト設定の型。ESP32の`GET /api/settings/devices`とそろえる。

export type PartType = "led" | "buzzer" | "thermo" | "tof";

/**
 * 部品リストの1行。最初からつながっているキットの部品も、後から足した部品も同じ扱い。
 * `pins`はLED・ブザーなら[ピン]、温度・距離センサ（I2C）なら[SDA, SCL]。
 */
export type Part = {
  id: string;
  type: PartType;
  label: string;
  pins: number[];
};

export type DeviceSettings = {
  /** 部品に使ってよいピン。ESP32が配る。 */
  candidatePins: number[];
  parts: Part[];
};

export const PART_TYPES: Record<
  PartType,
  { name: string; idBase: string; i2c: boolean }
> = {
  led: { name: "LED", idBase: "led", i2c: false },
  buzzer: { name: "ブザー", idBase: "buzzer", i2c: false },
  thermo: { name: "温度センサ", idBase: "temperature", i2c: true },
  tof: { name: "距離センサ", idBase: "distance", i2c: true },
};
