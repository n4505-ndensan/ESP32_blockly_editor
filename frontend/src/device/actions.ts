import {
  applyStates,
  deviceSource,
  deviceStore,
  isPending,
  setError,
  setPending,
} from "../store/deviceStore";
import type { DeviceState } from "./types";

const COMMAND_URL = "/api/devices/command";

/** 操作は冪等な`set`だけ。反転ではなく、したい状態をそのまま指定する。 */
export async function setOutput(id: string, on: boolean) {
  if (isPending(id)) return;
  setPending(id, true);

  try {
    if (deviceSource === "dummy") {
      applyStates([{ id, state: { on } }]);
      return;
    }

    const response = await fetch(COMMAND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "set", on }),
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      state?: DeviceState;
      message?: string;
    } | null;

    if (!response.ok) {
      setError(payload?.message ?? `操作できませんでした (${response.status})`);
      return;
    }

    if (payload?.id && payload.state)
      applyStates([{ id: payload.id, state: payload.state }]);

    setError(null);
  } catch {
    setError("ESP32へ送れませんでした。");
  } finally {
    setPending(id, false);
  }
}

export async function turnAllOff() {
  for (const device of deviceStore.devices) {
    if (device.control === "switch") await setOutput(device.id, false);
  }
}
