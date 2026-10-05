import { describe, expect, it } from "vitest";
import { MAX_I2C_BUSES, MAX_PARTS, defaultLabel, defaultPins, nextPartId, pinOwners, validateSettings } from "../src/settings/rules";
import type { DeviceSettings, Part } from "../src/settings/types";

const kit: Part[] = [
  { id: "led_red", type: "led", label: "赤色LED", pins: [5] },
  { id: "temperature", type: "thermo", label: "温度", pins: [21, 22] },
  { id: "distance", type: "tof", label: "距離", pins: [21, 22] },
];
const settings = (parts: Part[] = kit): DeviceSettings => ({ candidatePins: [2, 5, 13, 14, 21, 22, 25, 26, 27], parts });
const led = (id: string, pin: number): Part => ({ id, type: "led", label: id, pins: [pin] });
const thermo = (id: string, sda: number, scl: number): Part => ({ id, type: "thermo", label: id, pins: [sda, scl] });

describe("device settings rules", () => {
  it("accepts the initial kit, whose sensors share one bus", () => {
    expect(validateSettings(settings())).toEqual([]);
  });

  it("treats initial parts like any other: their pins and names can change", () => {
    const moved = kit.map((part) => (part.id === "led_red" ? { ...part, label: "赤", pins: [13] } : part));
    expect(validateSettings(settings(moved))).toEqual([]);
    expect(validateSettings(settings(kit.filter((part) => part.id !== "temperature")))).toEqual([]);
  });

  it("numbers new parts and reuses gaps", () => {
    expect(nextPartId("led", kit)).toBe("led_2");
    expect(nextPartId("led", [...kit, led("led_2", 13), led("led_4", 14)])).toBe("led_3");
    expect(nextPartId("thermo", kit)).toBe("temperature_2");
    expect(defaultLabel("tof", kit)).toBe("距離センサ 2");
  });

  it("suggests a free pin, or a bus that still has room for the sensor type", () => {
    expect(defaultPins("led", settings())).toEqual([2]);
    expect(defaultPins("thermo", settings())).toEqual([2, 13]);
    const roomy = kit.filter((part) => part.type !== "thermo");
    expect(defaultPins("thermo", settings(roomy))).toEqual([21, 22]);
  });

  it("reports which parts use each pin", () => {
    expect(pinOwners(kit).get(21)).toEqual([1, 2]);
    expect(pinOwners(kit).get(5)).toEqual([0]);
  });

  it("rejects pins shared outside one I2C bus", () => {
    expect(validateSettings(settings([...kit, led("led_2", 5)])).join()).toContain("「赤色LED」と「led_2」");
    expect(validateSettings(settings([...kit, led("led_2", 21)])).join()).toContain("GPIO21");
    expect(validateSettings(settings([...kit, led("led_2", 4)])).join()).toContain("使えないピン");
    // SDAとSCLを入れ替えた組は別のバスとみなし、共有を認めない。
    expect(validateSettings(settings([...kit, thermo("temperature_2", 22, 21)])).join()).toContain("重なっています");
  });

  it("allows one sensor of each type per bus and limits the number of buses", () => {
    expect(validateSettings(settings([...kit, thermo("temperature_2", 21, 22)])).join()).toContain("温度センサは1個まで");
    expect(validateSettings(settings([...kit, thermo("temperature_2", 25, 26)])).join()).toContain(`${MAX_I2C_BUSES}組まで`);
    // センサごと別のピンへ移すのは構わない。
    expect(validateSettings(settings(kit.map((part) => (part.type === "led" ? part : { ...part, pins: [25, 26] }))))).toEqual([]);
    expect(validateSettings(settings([thermo("temperature_2", 25, 25)])).join()).toContain("別のピン");
  });

  it("checks names, ids and the total count", () => {
    expect(validateSettings(settings([{ ...led("led_2", 13), label: "  " }])).join()).toContain("名前が空");
    expect(validateSettings(settings([{ ...led("led_2", 13), label: "あ".repeat(17) }])).join()).toContain("長すぎ");
    expect(validateSettings(settings([led("led_2", 13), { ...led("led_3", 14), label: "led_2" }])).join()).toContain("名前が重なって");
    expect(validateSettings(settings([led("led_2", 13), led("led_2", 14)])).join()).toContain("部品ID");
    const many = Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({ id: `buzzer_${i + 2}`, type: "buzzer" as const, label: `b${i}`, pins: [2] }));
    expect(validateSettings(settings(many)).join()).toContain(`${MAX_PARTS}個まで`);
  });
});
