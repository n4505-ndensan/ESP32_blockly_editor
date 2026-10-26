import { css } from "@acab/ecsstatic";
import { createSignal, onCleanup, type Component } from "solid-js";
import { programButton } from "~/components/styles";
import { stopProgram } from "~/program/actions";

// This button replaces RUN under the cursor; a double click must not stop the program it just started.
const ARM_DELAY_MS = 600;

const stopColor = css`
  background: #d64545;

  &:hover:not(:disabled) {
    background: #b83333;
  }
`;

const StopButton: Component = () => {
  const [armed, setArmed] = createSignal(false);
  const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
  onCleanup(() => clearTimeout(timer));

  return (
    <button
      class={`${programButton} ${stopColor}`}
      disabled={!armed()}
      onClick={() => void stopProgram()}
    >
      <svg width="30" height="30" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" fill="currentColor" />
      </svg>
      停止
    </button>
  );
};

export default StopButton;
