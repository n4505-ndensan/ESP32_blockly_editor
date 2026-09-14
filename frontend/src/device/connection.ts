import { onCleanup, onMount } from "solid-js";
import {
  applyStates,
  clearSensorValues,
  deviceSource,
  deviceStore,
  replaceCatalog,
  setError,
  setStatus,
} from "../store/deviceStore";
import { dummyCatalog, dummySensorValues } from "./dummyCatalog";
import type { Device, DeviceStateEvent } from "./types";

const CATALOG_URL = "/api/devices";

// ストアはモジュール単位で1つなので、接続も1つに限る。
let connected = false;

const loadCatalog = async () => {
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error(String(response.status));
    const payload = (await response.json()) as { devices?: Device[] };
    replaceCatalog(payload.devices ?? []);
    setError(null);
  } catch {
    setError("部品の一覧を取得できませんでした。");
  }
};

const startDummy = (cleanups: (() => void)[]) => {
  replaceCatalog(dummyCatalog());
  setStatus("ダミー値を表示中");

  let tick = 0;
  const update = () => {
    applyStates(dummySensorValues(tick));
    tick += 1;
  };

  update();
  const timer = window.setInterval(update, 1000);
  cleanups.push(() => window.clearInterval(timer));
};

const connect = (cleanups: (() => void)[]) => {
  const events = new EventSource("/events");
  cleanups.push(() => events.close());

  events.addEventListener("open", () => {
    setStatus("接続済み");
    // 起動直後にカタログの取得が失敗していた場合に備え、空のままなら取り直す。
    if (deviceStore.devices.length === 0) void loadCatalog();
  });

  events.addEventListener("error", () => {
    setStatus(events.readyState === EventSource.CLOSED ? "接続エラー" : "再接続中…");
    // 古い測定値は残さない。出力の状態はESP32が再接続時に送り直す。
    clearSensorValues();
  });

  // 接続直後のスナップショットと、その後の差分の両方がこのイベントで届く。
  events.addEventListener("devices", (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as DeviceStateEvent;
      if (Array.isArray(payload.devices)) applyStates(payload.devices);
    } catch {
      // 壊れたイベントは捨てる。次の配信で状態が追いつく。
    }
  });
};

/** ストアへの配信を始める。呼び出したコンポーネントの寿命で止まる。 */
export function initDeviceStore() {
  if (connected) return;
  connected = true;

  const cleanups: (() => void)[] = [];

  onMount(() => {
    if (deviceSource === "dummy") {
      startDummy(cleanups);
      return;
    }

    void loadCatalog();
    connect(cleanups);
  });

  onCleanup(() => {
    for (const dispose of cleanups) dispose();
    cleanups.length = 0;
    connected = false;
  });
}
