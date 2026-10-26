import { css } from "@acab/ecsstatic";
import type { Component } from "solid-js";
import { setCurrentSidebarTab, SidebarTab } from "~/components/SideBar";
import { programButton } from "~/components/styles";
import { canRun, runProgram } from "~/program/actions";
import { ProgramValidationError } from "~/program/types";
import { editor, updateStatusStore } from "~/store/statusStore";

const runColor = css`
  background: var(--color-accent);

  &:hover:not(:disabled) {
    background: #1b7ad8;
  }
`;

const RunButton: Component = () => {
  const run = async () => {
    const handle = editor();
    if (!handle || !canRun()) return;
    updateStatusStore({ diagnostic: null });
    handle.highlight(null);
    const at = handle.revision();
    updateStatusStore({ attemptRevision: at });
    try {
      const program = handle.compile();
      const accepted = await runProgram(program);
      if (accepted) {
        updateStatusStore({
          sent: {
            revision: at,
            bootId: accepted.bootId,
            runId: accepted.runId,
          },
        });
        // show "Parts Info" tab
        setCurrentSidebarTab(SidebarTab.PARTS_INFO);
      }
    } catch (error) {
      updateStatusStore({
        diagnostic:
          error instanceof ProgramValidationError
            ? error.detail
            : {
                code: "compile_error",
                message: "ブロックを読み取れませんでした。",
              },
      });
    }
  };

  return (
    <button
      class={`${programButton} ${runColor}`}
      disabled={!editor() || !canRun()}
      onClick={() => void run()}
    >
      <svg width="30" height="30" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 1v14l12-7z" fill="currentColor" />
      </svg>
      実行
    </button>
  );
};

export default RunButton;
