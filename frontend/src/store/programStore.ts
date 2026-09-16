import { createStore } from "solid-js/store";
import { isActive } from "../program/types";
import type { ProgramError, ProgramState } from "../program/types";

type Model = { state: ProgramState | null; known: boolean; pending: boolean; error: ProgramError | null };
const [programStore, setProgramStore] = createStore<Model>({ state: null, known: false, pending: false, error: null });
export { programStore };
export const updateProgramStore = (model: Model) => setProgramStore(model);
export const programBusy = () => programStore.pending || isActive(programStore.state?.state);
