import { ProgramClient } from "~/program/client";
import type { Program } from "~/program/types";
import { deviceSource, deviceStore } from "~/store/deviceStore";
import {
  programBusy,
  programStore,
  updateProgramStore,
} from "~/store/programStore";

const client = new ProgramClient(
  (...args) => fetch(...args),
  () => {
    updateProgramStore({
      state: client.state,
      known: client.known,
      pending: client.pending,
      error: client.error,
    });
  },
);
export const observeProgram = (state: unknown) => client.observe(state);
export const disconnectProgram = () => client.disconnected();
export const refreshProgram = () => client.refresh();
export const manualBlocked = () =>
  deviceSource === "sse" &&
  (programBusy() || !programStore.known || deviceStore.status !== "接続済み");
export const canRun = () =>
  deviceSource === "sse" &&
  deviceStore.status === "接続済み" &&
  programStore.known &&
  !programBusy() &&
  deviceStore.pendingIds.length === 0;
// STOP stays offered while the board state is unknown: a lost RUN response may have started it.
export const canStop = () =>
  deviceSource === "sse" && (programBusy() || !programStore.known);
export const runProgram = (program: Program) =>
  canRun() ? client.run(program) : Promise.resolve(null);
export const stopProgram = () =>
  deviceSource === "sse" ? client.stop() : Promise.resolve(null);
