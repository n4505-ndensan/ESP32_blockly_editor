import { createSignal, onCleanup, onMount } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { dummyCatalog, dummySensorValues } from "./dummyCatalog";
import type { Device, DeviceState, DeviceStateEvent } from "./types";

type StateEntry = { id: string; state: DeviceState };

const COMMAND_URL = "/api/devices/command";
const CATALOG_URL = "/api/devices";

export function createDeviceStore() {
  // Vite dev (including LAN access) and local build previews use dummy devices.
  const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const source = import.meta.env.DEV || localPreview ? "dummy" : "sse";

  const [devices, setDevices] = createStore<Device[]>([]);
  const [status, setStatus] = createSignal("接続中…");
  const [error, setError] = createSignal<string | null>(null);
  const [pendingIds, setPendingIds] = createSignal<readonly string[]>([]);
  const cleanups: (() => void)[] = [];

  // 状態はESP32が返したものだけを反映する。操作した瞬間には表示を変えない。
  const applyStates = (entries: StateEntry[]) => {
    setDevices(
      produce((list) => {
        for (const entry of entries) {
          const device = list.find((item) => item.id === entry.id);
          if (device) Object.assign(device.state, entry.state);
        }
      }),
    );
  };

  const clearSensorValues = () => {
    setDevices(
      produce((list) => {
        for (const device of list) {
          if (device.kind === "sensor") device.state.value = undefined;
        }
      }),
    );
  };

  const setPending = (id: string, pending: boolean) => {
    setPendingIds((ids) => (pending ? [...ids, id] : ids.filter((item) => item !== id)));
  };

  const loadCatalog = async () => {
    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { devices?: Device[] };
      // 部品が入れ替わっても取りこぼさないよう、IDを見て入れ替える。
      setDevices(reconcile(payload.devices ?? [], { key: "id" }));
      setError(null);
    } catch {
      setError("部品の一覧を取得できませんでした。");
    }
  };

  const startDummy = () => {
    setDevices(reconcile(dummyCatalog(), { key: "id" }));
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

  const connect = () => {
    const events = new EventSource("/events");
    cleanups.push(() => events.close());

    events.addEventListener("open", () => {
      setStatus("接続済み");
      // 起動直後にカタログの取得が失敗していた場合に備え、空のままなら取り直す。
      if (devices.length === 0) void loadCatalog();
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

  onMount(() => {
    if (source === "dummy") {
      startDummy();
      return;
    }

    void loadCatalog();
    connect();
  });

  onCleanup(() => {
    for (const dispose of cleanups) dispose();
  });

  /** 操作は冪等な`set`だけ。反転ではなく、したい状態をそのまま指定する。 */
  const setOutput = async (id: string, on: boolean) => {
    if (pendingIds().includes(id)) return;
    setPending(id, true);

    try {
      if (source === "dummy") {
        applyStates([{ id, state: { on } }]);
        return;
      }

      const response = await fetch(COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "set", on }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { id?: string; state?: DeviceState; message?: string }
        | null;

      if (!response.ok) {
        setError(payload?.message ?? `操作できませんでした (${response.status})`);
        return;
      }

      if (payload?.id && payload.state) applyStates([{ id: payload.id, state: payload.state }]);
      setError(null);
    } catch {
      setError("ESP32へ送れませんでした。");
    } finally {
      setPending(id, false);
    }
  };

  const turnAllOff = async () => {
    for (const device of devices) {
      if (device.control === "switch") await setOutput(device.id, false);
    }
  };

  return {
    source,
    devices,
    status,
    error,
    isPending: (id: string) => pendingIds().includes(id),
    setOutput,
    turnAllOff,
  };
}

export type DeviceStore = ReturnType<typeof createDeviceStore>;
