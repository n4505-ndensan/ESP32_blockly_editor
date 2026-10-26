import { css } from "@acab/ecsstatic";
import { Show, type Component } from "solid-js";
import RunButton from "~/components/sidebar/button_area/RunButton";
import StopButton from "~/components/sidebar/button_area/StopButton";
import { canStop } from "~/program/actions";

const root = css`
  display: flex;
  flex-direction: column;
  height: 100px;
  overflow: hidden;
`;

const ButtonArea: Component = () => (
  <div class={root}>
    <Show when={canStop()} fallback={<RunButton />}>
      <StopButton />
    </Show>
  </div>
);

export default ButtonArea;
