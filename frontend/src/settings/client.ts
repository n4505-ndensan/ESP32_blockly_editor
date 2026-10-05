import { deviceSource } from "../store/deviceStore";
import { loadDummySettings, saveDummySettings } from "./dummy";
import { PART_TYPES } from "./types";
import type { DeviceSettings, Part } from "./types";

const SETTINGS_URL = "/api/settings/devices";

const isPart = (value: unknown): value is Part => {
  const part = value as Partial<Part> | null;
  return (
    !!part &&
    typeof part.id === "string" &&
    typeof part.label === "string" &&
    typeof part.type === "string" &&
    part.type in PART_TYPES &&
    Array.isArray(part.pins) &&
    part.pins.every(Number.isInteger)
  );
};

const isSettings = (value: unknown): value is DeviceSettings => {
  const settings = value as Partial<DeviceSettings> | null;
  return !!settings && Array.isArray(settings.candidatePins) && settings.candidatePins.every(Number.isInteger) && Array.isArray(settings.parts) && settings.parts.every(isPart);
};

const messageOf = (payload: unknown) => {
  const message = (payload as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : null;
};

export async function loadSettings(): Promise<DeviceSettings> {
  if (deviceSource === "dummy") return loadDummySettings();
  const response = await fetch(SETTINGS_URL, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isSettings(payload)) throw new Error(messageOf(payload) ?? "部品リストを読み込めませんでした。");
  return payload;
}

/**
 * 部品リスト全体を置き換える。ESP32は保存後に再起動して反映するので"restarting"を返す。
 * 再接続後はbootIdが変わり、connection.tsがカタログを取り直す。
 */
export async function saveSettings(parts: readonly Part[]): Promise<"applied" | "restarting"> {
  if (deviceSource === "dummy") {
    saveDummySettings(parts);
    return "applied";
  }
  const response = await fetch(SETTINGS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
    signal: AbortSignal.timeout(5000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageOf(payload) ?? "部品リストを保存できませんでした。");
  return "restarting";
}
