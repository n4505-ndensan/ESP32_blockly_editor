import { css } from "@acab/ecsstatic";
import { For, type Component } from "solid-js";
import { templates } from "~/blockly/templates";
import BlockPreview from "~/components/sidebar/templates/BlockPreview";
import { accentButton } from "~/components/styles";
import { editor } from "~/store/statusStore";

const templateList = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
`;
const card = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  overflow: hidden;
  width: 100%;
  height: auto;
  border-radius: 6px;
  background: #eee;
`;
const addButton = css`
  align-self: flex-end;
`;
const TemplatesTab: Component = () => {
  return (
    <div class={templateList}>
      <For each={templates}>
        {(template, i) => (
          <div class={card}>
            <p>
              {i() + 1}. {template.caption}
            </p>
            <BlockPreview state={template.state} />
            <button
              type="button"
              class={`${accentButton} ${addButton}`}
              disabled={!editor()}
              onClick={() => editor()?.append(template.state)}
            >
              + 追加する
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default TemplatesTab;
