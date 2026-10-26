import { css } from "@acab/ecsstatic";
import { createEffect, createSignal, Show } from "solid-js";
import BlocklyEditor from "./components/BlocklyEditor";
import type { EditorHandle } from "./components/BlocklyEditor";
import DeviceControlPanel from "./components/DeviceControlPanel";
import SensorPanel from "./components/SensorPanel";
import SettingsDialog from "./components/SettingsDialog";
import { ghostButton, panel, runButton } from "./components/styles";
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
  const [settingsOpen, setSettingsOpen] = createSignal(false);
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
    <main class={appShell}>
      <header class={appHeader}>
        <h1>ESP32 Block Editor</h1>
        <div class={programControls}>
          <span class={programStatus} role="status">{deviceSource === "dummy" ? "実機未接続" : !programStore.known ? "実行状態を確認中…" : labels[programStore.state!.state]}</span>
          <button class={ghostButton} disabled={!editor()} onClick={validate}>ブロックを確認</button>
          <button class={runButton} disabled={!editor() || !canRun()} onClick={() => void run()}>実行 / RUN</button>
          <button class={ghostButton} disabled={deviceSource === "dummy"} onClick={() => void stopProgram()}>停止 / STOP</button>
          <button class={ghostButton} onClick={() => setSettingsOpen(true)}>設定</button>
        </div>
      </header>
      <SettingsDialog open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <Show when={message()}><p class={programError} role="alert">{message()}</p></Show>
      <Show when={validated() && !message()}><p class={programNote} role="status">ブロックに問題はありません。</p></Show>
      <Show when={deviceSource === "dummy" || programBusy()}>
        <p class={programNote}>{deviceSource === "dummy" ? "ダミー部品で編集できます。実行にはESP32への接続が必要です。" : "実行中の編集は、次回の実行に反映されます。"}</p>
      </Show>
      <div class={workspaceLayout}>
        <section class={`${editorPanel} ${panel}`} aria-label="ブロック編集">
          <BlocklyEditor onReady={setEditor} onEdit={(value) => { setRevision(value); setDiagnostic(null); setValidated(false); }} />
        </section>

        <div class={sideColumn}>
          <SensorPanel />
          <DeviceControlPanel />
        </div>
      </div>
    </main>
  );
}

const appShell = css`
  display: flex;
  flex-direction: column;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0;
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;

  @media (max-width: 720px) {
    padding-top: 20px;
  }
`;

const appHeader = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  gap: 16px;
  padding: 12px 18px;
  border: 1px solid #222222;
  border-top: none;

  @media (max-width: 720px) {
    margin-bottom: 20px;
  }
`;

const programControls = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
`;

const programStatus = css`
  font-size: 13px;
`;

const programError = css`
  padding: 10px 18px;
  color: #903a2c;
  background: #fff0ed;
  border-inline: 1px solid #222;
`;

const programNote = css`
  padding: 6px 18px;
  font-size: 12px;
  background: #f2f6f4;
  border-inline: 1px solid #222;
`;

const workspaceLayout = css`
  display: grid;
  height: 100%;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 380px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 16px;
  }
  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const editorPanel = css`
  overflow: hidden;
  height: 100%;
  border-left: 1px solid #222222;
`;

const sideColumn = css`
  display: grid;
  align-content: start;
  min-width: 0;
  height: 100%;
  flex: 1;
  background: #fff;
  border: 1px solid #222222;
  border-top: none;
  border-bottom: none;

  @media (max-width: 900px) {
    gap: 16px;
  }
`;
