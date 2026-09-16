import { createEffect, createSignal, Show } from "solid-js";
import BlocklyEditor from "./components/BlocklyEditor";
import type { EditorHandle } from "./components/BlocklyEditor";
import DeviceControlPanel from "./components/DeviceControlPanel";
import SensorPanel from "./components/SensorPanel";
import { initDeviceStore } from "./device/connection";
import { deviceSource } from "./store/deviceStore";
import { programBusy, programStore } from "./store/programStore";
import { canRun, runProgram, stopProgram } from "./program/actions";
import { ProgramValidationError } from "./program/types";
import type { ProgramError, ProgramStatus } from "./program/types";

const labels: Record<ProgramStatus, string> = { idle: "待機中", starting: "開始待ち", running: "実行中", stopping: "停止中", completed: "実行完了", stopped: "停止済み", error: "実行エラー" };
export default function App() {
  initDeviceStore();
  const [editor, setEditor] = createSignal<EditorHandle>();
  const [revision, setRevision] = createSignal(0);
  const [diagnostic, setDiagnostic] = createSignal<ProgramError | null>(null);
  const [sent, setSent] = createSignal<{ revision: number; bootId: string; runId: number }>();
  const [attemptRevision, setAttemptRevision] = createSignal<number>();
  const [validated, setValidated] = createSignal(false);
  const validate = () => {
    const handle = editor(); if (!handle) return;
    setAttemptRevision(handle.revision()); setDiagnostic(null); setValidated(false);
    try { handle.compile(); setValidated(true); }
    catch (error) { setDiagnostic(error instanceof ProgramValidationError ? error.detail : { code: "compile_error", message: "ブロックを読み取れませんでした。" }); }
  };
  const run = async () => {
    const handle = editor(); if (!handle || !canRun()) return;
    setDiagnostic(null); handle.highlight(null);
    const at = handle.revision(); setAttemptRevision(at);
    try {
      const program = handle.compile();
      const accepted = await runProgram(program);
      if (accepted) setSent({ revision: at, bootId: accepted.bootId, runId: accepted.runId });
    } catch (error) {
      setDiagnostic(error instanceof ProgramValidationError ? error.detail : { code: "compile_error", message: "ブロックを読み取れませんでした。" });
    }
  };
  createEffect(() => {
    const current = programStore.state, source = sent();
    let blockId: string | undefined;
    if (diagnostic() && revision() === attemptRevision()) blockId = diagnostic()?.blockId;
    else if (programStore.error && revision() === attemptRevision()) blockId = programStore.error.blockId;
    else if (current?.error && source && source.bootId === current.bootId && source.runId === current.runId && source.revision === revision()) blockId = current.error.blockId;
    editor()?.highlight(blockId ?? null);
  });
  const message = () => diagnostic()?.message ?? programStore.error?.message ?? programStore.state?.error?.message;
  return (
    <main class="app-shell">
      <header class="app-header">
        <h1 class="header-title">ESP32 Block Editor</h1>
        <div class="program-controls">
          <span class="program-status" role="status">{deviceSource === "dummy" ? "実機未接続" : !programStore.known ? "実行状態を確認中…" : labels[programStore.state!.state]}</span>
          <button class="ghost-button" disabled={!editor()} onClick={validate}>ブロックを確認</button>
          <button class="run-button" disabled={!editor() || !canRun()} onClick={() => void run()}>実行 / RUN</button>
          <button class="ghost-button" disabled={deviceSource === "dummy"} onClick={() => void stopProgram()}>停止 / STOP</button>
        </div>
      </header>
      <Show when={message()}><p class="program-error" role="alert">{message()}</p></Show>
      <Show when={validated() && !message()}><p class="program-note" role="status">ブロックに問題はありません。</p></Show>
      <Show when={deviceSource === "dummy" || programBusy()}>
        <p class="program-note">{deviceSource === "dummy" ? "ダミー部品で編集できます。実行にはESP32への接続が必要です。" : "実行中の編集は、次回の実行に反映されます。"}</p>
      </Show>
      <div class="workspace-layout">
        <section class="editor-panel panel" aria-label="ブロック編集">
          <BlocklyEditor onReady={setEditor} onEdit={(value) => { setRevision(value); setDiagnostic(null); setValidated(false); }} />
        </section>

        <div class="side-column">
          <SensorPanel />
          <DeviceControlPanel />
        </div>
      </div>
    </main>
  );
}
