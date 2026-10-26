import { css } from "@acab/ecsstatic";
import { Show, type Component } from "solid-js";
import type { ProgramStatus } from "~/program/types";
import { deviceSource } from "~/store/deviceStore";
import { programBusy, programStore } from "~/store/programStore";
import { statusStore } from "~/store/statusStore";

const barRoot = css`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 0 12px;
  background: #f2f6f4;
  border-bottom: 1px solid #aaa;
`;

const infoTextContainer = css`
  margin-right: auto;
`;
const infoText = css`
  font-size: 12px;
`;

const error = css`
  color: #903a2c;
`;

const TopInfoBar: Component = () => {
  const message = () =>
    statusStore.diagnostic?.message ??
    programStore.error?.message ??
    programStore.state?.error?.message;

  return (
    <div class={barRoot}>
      <div class={infoTextContainer}>
        <Show when={message()}>
          <p class={`${infoText} ${error}`} role="alert">
            {message()}
          </p>
        </Show>
        <Show when={statusStore.validated && !message()}>
          <p class={infoText} role="status">
            ブロックに問題はありません。
          </p>
        </Show>
        <Show when={programBusy()}>
          <p class={infoText}>実行中の編集は、次回の実行に反映されます。</p>
        </Show>
      </div>

      <ProgramStatus />
    </div>
  );
};

const programStatus = css`
  font-size: 10px;
  font-family: PM10;
  opacity: 0.8;
`;

const labels: Record<ProgramStatus, string> = {
  idle: "待機中",
  starting: "開始待ち",
  running: "実行中",
  stopping: "停止中",
  completed: "実行完了",
  stopped: "停止済み",
  error: "実行エラー",
};
const ProgramStatus: Component = () => {
  return (
    <span class={programStatus} role="status" aria-label="実行状態">
      {deviceSource === "dummy"
        ? "実機未接続"
        : !programStore.known
          ? "実行状態を確認中…"
          : labels[programStore.state!.state]}
    </span>
  );
};

export default TopInfoBar;
