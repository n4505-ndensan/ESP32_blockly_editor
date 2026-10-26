import { css } from "@acab/ecsstatic";
import type { Component } from "solid-js";
import { ghostButton } from "~/components/styles";
import { ProgramValidationError } from "~/program/types";
import { deviceSource } from "~/store/deviceStore";
import { editor, updateStatusStore } from "~/store/statusStore";

const appHeader = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  gap: 16px;
  padding: 12px 12px;
  color: white;
  border-top: none;

  @media (max-width: 720px) {
    margin-bottom: 20px;
  }
`;

const headerText = css`
  user-select: none;
  opacity: 0.5;
  filter: drop-shadow(0 0 5px rgba(200, 200, 200, 10));

  &:hover {
    opacity: 1;
  }
`;

const programControls = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
`;

const Header: Component<{ onOpenSettings: () => void }> = (props) => {
  const validate = () => {
    const handle = editor();
    if (!handle) return;
    updateStatusStore({
      attemptRevision: handle.revision(),
      diagnostic: null,
      validated: false,
    });
    try {
      handle.compile();
      updateStatusStore({ validated: true });
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
    <header class={appHeader}>
      <h1 class={headerText}>
        ESP32 Block Editor{deviceSource === "dummy" && "[local]"}
      </h1>
      <div class={programControls}>
        <button class={ghostButton} disabled={!editor()} onClick={validate}>
          ブロックを確認
        </button>
        <button class={ghostButton} onClick={() => props.onOpenSettings()}>
          設定
        </button>
      </div>
    </header>
  );
};

export default Header;
