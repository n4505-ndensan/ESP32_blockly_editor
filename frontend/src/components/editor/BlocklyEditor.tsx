import { css } from "@acab/ecsstatic";
import * as Blockly from "blockly/core";
import { createEffect, onCleanup, onMount } from "solid-js";
import { configureDeviceBlocks } from "~/blockly/deviceBlocks";
import { FixedScaleFlyout, theme } from "~/blockly/setup";
import { createToolbox } from "~/blockly/toolbox";
import {
  clearWorkspaceState,
  hasBlocks,
  loadWorkspaceState,
  saveWorkspaceState,
  type WorkspaceState,
} from "~/blockly/workspaceStorage";
import { compileWorkspace } from "~/program/compile";
import type { Program } from "~/program/types";
import { deviceStore } from "~/store/deviceStore";

const SAVE_DELAY_MS = 400;
const APPEND_MARGIN = 24;

// プライベートモードなどlocalStorage自体が例外を投げる環境がある。
const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export type EditorHandle = {
  compile: () => Program;
  revision: () => number;
  highlight: (blockId: string | null) => void;
  /** Adds a block stack below the existing stacks and scrolls it into view. */
  append: (state: Blockly.serialization.blocks.State) => void;
};
export default function BlocklyEditor(props: {
  onReady: (editor: EditorHandle) => void;
  onEdit: (revision: number) => void;
}) {
  let container!: HTMLDivElement;
  let workspace: Blockly.WorkspaceSvg | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let revision = 0;
  // 復元・初期配置で発生する変更イベントは編集とみなさない。
  let restoring = false;
  let saveTimer: number | undefined;
  // 保存待ち、または保存に失敗して失われうる編集があることを示す。
  let unsaved = false;

  onMount(() => {
    const storage = browserStorage();
    configureDeviceBlocks(deviceStore.devices);
    workspace = Blockly.inject(container, {
      toolbox: createToolbox(deviceStore.devices),
      theme,
      media: `${import.meta.env.BASE_URL}blockly_media/`,
      sounds: false,
      trashcan: true,
      grid: { spacing: 24, length: 4, colour: "#b5bebb", snap: false },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      plugins: { flyoutsVerticalToolbox: FixedScaleFlyout },
    });
    const seed = () => {
      const start = workspace!.newBlock("program_start");
      start.initSvg();
      start.render();
      // Center horizontally so the open flyout on the left does not cover it.
      const view = workspace!.getMetricsManager().getViewMetrics(true);
      const { width } = start.getHeightWidth();
      start.moveBy(
        view.left + (view.width - width) / 2,
        view.top + view.height / 4,
      );
    };
    const saved = storage ? loadWorkspaceState(storage) : null;
    restoring = true;
    try {
      if (hasBlocks(saved))
        Blockly.serialization.workspaces.load(
          saved as WorkspaceState,
          workspace,
        );
      else seed();
    } catch {
      // 保存データが現在のブロック定義と合わない場合は捨てて作り直す。
      workspace.clear();
      if (storage) clearWorkspaceState(storage);
      seed();
    } finally {
      restoring = false;
    }

    const flush = () => {
      if (saveTimer !== undefined) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
      }
      if (!unsaved || !workspace) return;
      if (!storage) return;
      const state = Blockly.serialization.workspaces.save(
        workspace,
      ) as WorkspaceState;
      unsaved = !saveWorkspaceState(storage, state);
    };
    const scheduleSave = () => {
      unsaved = true;
      if (!storage) return;
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
    };
    // 保存できなかった編集が残る場合だけ、離脱前に確認ダイアログを出す。
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (unsaved) event.preventDefault();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    onCleanup(() => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    });
    const warnings = () => {
      if (!workspace) return;
      const roots = workspace
        .getAllBlocks(false)
        .filter((block) => block.type === "program_start" && block.isEnabled());
      const reachable = new Set(
        roots.flatMap((root) =>
          root.getDescendants(false).map((block) => block.id),
        ),
      );
      for (const block of workspace.getAllBlocks(false))
        block.setWarningText(
          reachable.has(block.id)
            ? null
            : "開始につながっていないため実行されません。",
          "unconnected",
        );
    };
    workspace.addChangeListener((event) => {
      if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING)
        return;
      if (restoring) {
        warnings();
        return;
      }
      ++revision;
      workspace?.highlightBlock(null);
      props.onEdit(revision);
      warnings();
      scheduleSave();
    });
    warnings();
    props.onReady({
      compile: () => compileWorkspace(workspace!, deviceStore.devices),
      revision: () => revision,
      highlight: (id) => workspace?.highlightBlock(id),
      append: (state) => {
        if (!workspace) return;
        // Place below every existing stack so the new one never overlaps them.
        // The gap must exceed the snap radius, or Blockly bumps the new stack away.
        const view = workspace.getMetricsManager().getViewMetrics(true);
        const content = workspace.getTopBlocks(false).length
          ? workspace.getBlocksBoundingBox()
          : null;
        const block = Blockly.serialization.blocks.append(
          {
            ...state,
            x: content ? content.left : view.left + APPEND_MARGIN,
            y: content
              ? content.bottom + Blockly.config.snapRadius + APPEND_MARGIN
              : view.top + APPEND_MARGIN,
          },
          workspace,
        ) as Blockly.BlockSvg;
        block.select();
        workspace.scrollBoundsIntoView(block.getBoundingRectangle());
      },
    });

    // Observe the allocated panel, including layout changes at breakpoints.
    resizeObserver = new ResizeObserver(() => {
      if (workspace) Blockly.svgResize(workspace);
    });
    resizeObserver.observe(container);
  });

  // カタログはESP32から遅れて届く。届いた分だけ部品カテゴリを作り直す。
  createEffect(() => {
    // Read only descriptor fields so sensor SSE updates do not rebuild the toolbox.
    const catalog = deviceStore.devices.map((d) => ({
      id: d.id,
      label: d.label,
      type: d.type,
      unit: d.unit,
      kind: d.kind,
      control: d.control,
      state: {},
    }));
    configureDeviceBlocks(catalog, workspace);
    const toolbox = createToolbox(catalog);
    workspace?.updateToolbox(toolbox);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    workspace?.dispose();
  });

  return (
    <div
      ref={container}
      class={blocklyEditor}
      aria-label="ブロック編集エリア"
    />
  );
}

const blocklyEditor = css`
  position: relative;
  width: 100%;
  height: 100%;
  isolation: isolate;

  & .blocklySvg {
    border: 0;
  }

  /* Blockly sizes the toolbox to its widest category by default. */
  & .blocklyToolbox {
    box-sizing: border-box;
    width: 120px;
    border-right: 1px solid #aaa;
  }

  & .blocklyToolboxCategory {
    height: 33px;
    cursor: pointer;
  }

  /* Blockly's default white hover is invisible on the light toolbox. */
  & .blocklyToolboxCategory:not(.blocklyToolboxSelected):hover {
    background-color: rgba(0, 0, 0, 0.08);
  }

  & .blocklyTreeRowContentContainer {
    display: flex;
    align-items: center;
    height: 100%;
  }

  /* Categories have no icons; the empty slot only indents the label. */
  & .blocklyToolboxCategoryIcon {
    width: 7px;
  }

  @media (max-width: 720px) {
    height: 480px;
  }
`;
