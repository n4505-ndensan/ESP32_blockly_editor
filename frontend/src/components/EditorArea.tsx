import { css } from "@acab/ecsstatic";
import { createEffect, type Component } from "solid-js";
import BlocklyEditor from "~/components/editor/BlocklyEditor";
import { panel } from "~/components/styles";
import { programStore } from "~/store/programStore";
import {
  editor,
  setEditor,
  statusStore,
  updateStatusStore,
} from "~/store/statusStore";

const editorPanel = css`
  overflow: hidden;
  height: 100%;
`;

const EditorArea: Component = () => {
  createEffect(() => {
    const current = programStore.state,
      source = statusStore.sent,
      { diagnostic, revision, attemptRevision } = statusStore;
    let blockId: string | undefined;
    if (diagnostic && revision === attemptRevision)
      blockId = diagnostic.blockId;
    else if (programStore.error && revision === attemptRevision)
      blockId = programStore.error.blockId;
    // Highlights the failing block, or the sensor block a running program waits on.
    else if (
      (current?.error || current?.waiting) &&
      source &&
      source.bootId === current.bootId &&
      source.runId === current.runId &&
      source.revision === revision
    )
      blockId = current.error?.blockId ?? current.waiting?.blockId;
    editor()?.highlight(blockId ?? null);
  });

  return (
    <section class={`${editorPanel} ${panel}`} aria-label="ブロック編集">
      <BlocklyEditor
        onReady={setEditor}
        onEdit={(value) =>
          updateStatusStore({
            revision: value,
            diagnostic: null,
            validated: false,
          })
        }
      />
    </section>
  );
};

export default EditorArea;
