import type { DeviceSettings, Part, PartType } from "~/settings/types";
import { PART_TYPES } from "~/settings/types";

// ESP32も保存時に同じ判定をする。ここは画面で先に知らせるためのもの。

/** 変化の印（32ビット）に収まる数。 */
export const MAX_PARTS = 32;
export const MAX_LABEL_BYTES = 48;
/** SDA・SCLの組が同じ部品は同じバスに並べてつなぐ。ESP32のI2Cは2系統。 */
export const MAX_I2C_BUSES = 2;

const bytes = (value: string) => new TextEncoder().encode(value).length;
const busKey = (pins: readonly number[]) => `${pins[0]}/${pins[1]}`;
const isI2c = (part: Part) => PART_TYPES[part.type].i2c;

function nextNumber(type: PartType, parts: readonly Part[]): number {
  const base = PART_TYPES[type].idBase;
  const taken = new Set(parts.map((part) => part.id));
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return n;
}

/** `led_2`, `distance_2`…の形で、使われていない番号を振る。 */
export const nextPartId = (type: PartType, parts: readonly Part[]) =>
  `${PART_TYPES[type].idBase}_${nextNumber(type, parts)}`;

export const defaultLabel = (type: PartType, parts: readonly Part[]) =>
  `${PART_TYPES[type].name} ${nextNumber(type, parts)}`;

/** 新しい行の初期ピン。センサは同じ種類がまだ載っていないI2Cバスがあればそこに並べる。 */
export function defaultPins(
  type: PartType,
  settings: DeviceSettings,
): number[] {
  const { parts, candidatePins } = settings;
  const used = new Set(parts.flatMap((part) => part.pins));
  const free = candidatePins.filter((pin) => !used.has(pin));
  if (!PART_TYPES[type].i2c) return free.slice(0, 1);
  const bus = parts.find(
    (part) =>
      isI2c(part) &&
      !parts.some(
        (other) =>
          other.type === type && busKey(other.pins) === busKey(part.pins),
      ),
  );
  return bus ? [...bus.pins] : free.slice(0, 2);
}

/** ピンごとに、それを使っている部品の行番号。 */
export function pinOwners(parts: readonly Part[]): Map<number, number[]> {
  const owners = new Map<number, number[]>();
  parts.forEach((part, index) => {
    for (const pin of new Set(part.pins))
      owners.set(pin, [...(owners.get(pin) ?? []), index]);
  });
  return owners;
}

/** 保存できる内容か。問題があれば理由をすべて返す。 */
export function validateSettings(settings: DeviceSettings): string[] {
  const { candidatePins, parts } = settings;
  const problems = new Set<string>();
  if (parts.length > MAX_PARTS)
    problems.add(`部品は${MAX_PARTS}個まで登録できます。`);

  const ids = new Set<string>(),
    labels = new Set<string>();
  const uses = new Map<number, { role: string; bus: string; name: string }>();
  const buses = new Map<string, Set<PartType>>();
  for (const part of parts) {
    if (ids.has(part.id))
      problems.add(`部品ID「${part.id}」が重なっています。`);
    ids.add(part.id);

    const label = part.label.trim();
    const name = label || PART_TYPES[part.type].name;
    if (!label) problems.add("名前が空の部品があります。");
    else if (bytes(label) > MAX_LABEL_BYTES)
      problems.add(`「${label}」は名前が長すぎます。`);
    else if (labels.has(label))
      problems.add(`「${label}」という名前が重なっています。`);
    labels.add(label);

    const i2c = isI2c(part);
    if (part.pins.length !== (i2c ? 2 : 1)) {
      problems.add(`「${name}」のピンを選んでください。`);
      continue;
    }
    if (i2c && part.pins[0] === part.pins[1]) {
      problems.add(`「${name}」のSDAとSCLには別のピンを選んでください。`);
      continue;
    }
    const roles = i2c ? ["SDA", "SCL"] : ["pin"];
    const bus = i2c ? busKey(part.pins) : "";
    part.pins.forEach((pin, index) => {
      if (!candidatePins.includes(pin)) {
        problems.add(`「${name}」のGPIO${pin}は使えないピンです。`);
        return;
      }
      const held = uses.get(pin);
      if (!held) uses.set(pin, { role: roles[index], bus, name });
      // 同じSDA・SCLの組を使うI2C部品だけは、ピンを共有できる。
      else if (!(i2c && held.role === roles[index] && held.bus === bus))
        problems.add(
          `GPIO${pin}が「${held.name}」と「${name}」で重なっています。`,
        );
    });
    if (i2c) {
      const types = buses.get(bus) ?? new Set<PartType>();
      if (types.has(part.type))
        problems.add(
          `同じI2C（SDA GPIO${part.pins[0]} / SCL GPIO${part.pins[1]}）に${PART_TYPES[part.type].name}は1個までです。`,
        );
      buses.set(bus, types.add(part.type));
    }
  }
  if (buses.size > MAX_I2C_BUSES)
    problems.add(`I2C（SDA・SCLの組）は${MAX_I2C_BUSES}組までです。`);
  return [...problems];
}
