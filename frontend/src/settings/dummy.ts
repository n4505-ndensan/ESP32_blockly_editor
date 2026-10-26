import { dummyParts, partDevice } from "~/device/dummyCatalog";
import type { DeviceSettings, Part } from "~/settings/types";
import { replaceCatalog } from "~/store/deviceStore";

// PCだけで設定画面を触るための仮の設定。実機ではESP32が部品リストと候補ピンを配る。
// 保存先はメモリだけで、再読み込みすると初期の部品リストに戻る。
const candidatePins = [
  2, 4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33,
];

const copy = (parts: readonly Part[]) =>
  parts.map((part) => ({ ...part, pins: [...part.pins] }));

let saved = copy(dummyParts);

export const loadDummySettings = (): DeviceSettings => ({
  candidatePins,
  parts: copy(saved),
});

/** 実機の「保存→再起動→カタログ取り直し」の代わりに、カタログを直接入れ替える。 */
export const saveDummySettings = (parts: readonly Part[]) => {
  saved = copy(parts);
  replaceCatalog(saved.map(partDevice));
};
