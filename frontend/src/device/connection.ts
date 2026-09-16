import { onCleanup, onMount } from "solid-js";
import {
  applyStates,
  applyConfirmedStates,
  catalogBootId,
  clearSensorValues,
  deviceSource,
  replaceCatalog,
  setError,
  setStatus,
  DeviceStatus,
} from "../store/deviceStore";
import { observeProgram, disconnectProgram } from "../program/actions";
import { isProgramState } from "../program/client";
import { dummyCatalog, dummySensorValues } from "./dummyCatalog";
import type { Device, DeviceStateEvent } from "./types";

let initialized = false;
/** One connection per module store; ownership follows the root component. */
export function initDeviceStore() {
  if (initialized) return;
  initialized = true;
  let disposed = false,
    bootstrapping = false;
  let events: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let dummyTimer: ReturnType<typeof setInterval> | undefined;
  const connect = () => {
    const stream = new EventSource("/events");
    events = stream;
    let receivedDevices = false,
      receivedProgram = false;
    const ready = () => {
      if (receivedDevices && receivedProgram) setStatus(DeviceStatus.CONNECTED);
    };
    stream.addEventListener("open", () => {
      if (stream !== events || disposed) return;
      receivedDevices = receivedProgram = false;
      setStatus(DeviceStatus.SYNCING);
    });
    stream.addEventListener("error", () => {
      if (stream !== events || disposed) return;
      setStatus(DeviceStatus.RECONNECTING);
      disconnectProgram();
      clearSensorValues();
    });
    stream.addEventListener("devices", (event: MessageEvent<string>) => {
      if (stream !== events || disposed) return;
      try {
        const payload = JSON.parse(event.data) as DeviceStateEvent;
        if (
          !Array.isArray(payload.devices) ||
          typeof payload.bootId !== "string"
        )
          return;
        if (payload.bootId !== catalogBootId()) {
          void bootstrap();
          return;
        }
        applyConfirmedStates(payload.devices, payload.bootId, payload.revision);
        receivedDevices = true;
        ready();
      } catch {
        /* Ignore malformed events. */
      }
    });
    stream.addEventListener("program", (event: MessageEvent<string>) => {
      if (stream !== events || disposed) return;
      try {
        const payload: unknown = JSON.parse(event.data);
        if (!isProgramState(payload)) return;
        if (payload.bootId !== catalogBootId()) {
          void bootstrap();
          return;
        }
        observeProgram(payload);
        receivedProgram = true;
        ready();
      } catch {
        /* Ignore malformed events. */
      }
    });
  };
  const bootstrap = async () => {
    if (disposed || bootstrapping) return;
    bootstrapping = true;
    events?.close();
    events = undefined;
    disconnectProgram();
    setStatus(DeviceStatus.CONNECTING);
    try {
      const response = await fetch("/api/devices", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("catalog");
      const payload = (await response.json()) as {
        devices: Device[];
        bootId: string;
        revision: number;
      };
      if (
        !Array.isArray(payload.devices) ||
        typeof payload.bootId !== "string" ||
        !Number.isInteger(payload.revision)
      )
        throw new Error("catalog");
      if (disposed) return;
      replaceCatalog(payload.devices, payload.bootId, payload.revision);
      setError(null);
      connect();
    } catch {
      if (!disposed) {
        setError("部品の一覧を取得できませんでした。");
        retry = setTimeout(() => void bootstrap(), 2000);
      }
    } finally {
      bootstrapping = false;
    }
  };
  onMount(() => {
    if (deviceSource === "sse") {
      void bootstrap();
      return;
    }
    replaceCatalog(dummyCatalog());
    setStatus(DeviceStatus.LOCAL_DEV_DUMMY);
    let tick = 0;
    const update = () => applyStates(dummySensorValues(tick++));
    update();
    dummyTimer = setInterval(update, 1000);
  });
  onCleanup(() => {
    disposed = true;
    initialized = false;
    events?.close();
    clearTimeout(retry);
    clearInterval(dummyTimer);
    disconnectProgram();
  });
}
