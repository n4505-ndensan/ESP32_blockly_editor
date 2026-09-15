import { createStore, produce, reconcile } from "solid-js/store";
import type { Device, DeviceState } from "../device/types";

export type DeviceSource = "dummy" | "sse";

// Vite dev (including LAN access) and local build previews use dummy devices.
const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(
  location.hostname,
);

/** 起動後に変わらないので、ストアではなく定数として持つ。 */
export const deviceSource: DeviceSource =
  import.meta.env.DEV || localPreview ? "dummy" : "sse";

export enum DeviceStatus {
  CONNECTING = "接続中…",
  CONNECTED = "接続済み",
  LOCAL_DEV_DUMMY = "ダミー値を表示中",
  CONNECTION_ERROR = "接続エラー",
  RECONNECTING = "再接続中…",
}

export type DeviceStore = {
  devices: Device[];
  status: DeviceStatus;
  error: string | null;
  pendingIds: string[];
};

// 書き換えはこのファイルのプリミティブ経由に限る。setterは外へ出さない。
const [deviceStore, setDeviceStore] = createStore<DeviceStore>({
  devices: [],
  status: DeviceStatus.CONNECTING,
  error: null,
  pendingIds: [],
});

export { deviceStore };

export const isPending = (id: string) => deviceStore.pendingIds.includes(id);

type StateEntry = { id: string; state: DeviceState };

// 状態はESP32が返したものだけを反映する。操作した瞬間には表示を変えない。
export const applyStates = (entries: readonly StateEntry[]) => {
  setDeviceStore(
    "devices",
    produce((list) => {
      for (const entry of entries) {
        const device = list.find((item) => item.id === entry.id);
        if (device) Object.assign(device.state, entry.state);
      }
    }),
  );
};

/** 部品が入れ替わっても取りこぼさないよう、IDを見て入れ替える。 */
export const replaceCatalog = (devices: readonly Device[]) => {
  setDeviceStore("devices", reconcile([...devices], { key: "id" }));
};

export const clearSensorValues = () => {
  setDeviceStore(
    "devices",
    produce((list) => {
      for (const device of list) {
        if (device.kind === "sensor") device.state.value = undefined;
      }
    }),
  );
};

export const setStatus = (status: DeviceStatus) =>
  setDeviceStore("status", status);

export const setError = (error: string | null) =>
  setDeviceStore("error", error);

export const setPending = (id: string, pending: boolean) => {
  setDeviceStore("pendingIds", (ids) =>
    pending ? [...ids, id] : ids.filter((item) => item !== id),
  );
};
