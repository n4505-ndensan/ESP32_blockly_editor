import { createEffect, onCleanup, onMount } from "solid-js";
import * as Blockly from "blockly/core";
import { blocks } from "blockly/blocks";
import * as ja from "blockly/msg/ja";
import { configureDeviceBlocks } from "../blockly/deviceBlocks";
import { createToolbox } from "../blockly/toolbox";
import { clearWorkspaceState, hasBlocks, loadWorkspaceState, saveWorkspaceState } from "../blockly/workspaceStorage";
import type { WorkspaceState } from "../blockly/workspaceStorage";
import { deviceStore } from "../store/deviceStore";
import { compileWorkspace } from "../program/compile";
import type { Program } from "../program/types";

Blockly.setLocale(ja);
for (const [name, definition] of Object.entries(blocks)) if (!Blockly.Blocks[name]) Blockly.Blocks[name] = definition;

const theme = Blockly.Theme.defineTheme("workspace", {
  name: "workspace",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#fafcfc",
    toolboxBackgroundColour: "#f0f4f3",
    toolboxForegroundColour: "#354b46",
    flyoutBackgroundColour: "#e7eeec",
    flyoutForegroundColour: "#354b46",
    flyoutOpacity: 1,
    scrollbarColour: "#a5b9b2",
  },
  fontStyle: { family: "system-ui, sans-serif", size: 12 },
});

const SAVE_DELAY_MS = 400;

// プライベートモードなどlocalStorage自体が例外を投げる環境がある。
const browserStorage = () => { try { return window.localStorage; } catch { return null; } };

export type EditorHandle = { compile: () => Program; revision: () => number; highlight: (blockId: string | null) => void };
export default function BlocklyEditor(props: { onReady: (editor: EditorHandle) => void; onEdit: (revision: number) => void }) {
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
      media: `${import.meta.env.BASE_URL}media/`,
      sounds: false,
      trashcan: true,
      grid: { spacing: 24, length: 4, colour: "#b5bebb", snap: false },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.9 },
    });
    const seed = () => {
      const start = workspace!.newBlock("program_start"); start.initSvg(); start.render(); start.moveBy(35, 35);
    };
    const saved = storage ? loadWorkspaceState(storage) : null;
    restoring = true;
    try {
      if (hasBlocks(saved)) Blockly.serialization.workspaces.load(saved as WorkspaceState, workspace);
      else seed();
    } catch {
      // 保存データが現在のブロック定義と合わない場合は捨てて作り直す。
      workspace.clear(); if (storage) clearWorkspaceState(storage); seed();
    } finally { restoring = false; }

    const flush = () => {
      if (saveTimer !== undefined) { clearTimeout(saveTimer); saveTimer = undefined; }
      if (!unsaved || !workspace) return;
      if (!storage) return;
      const state = Blockly.serialization.workspaces.save(workspace) as WorkspaceState;
      unsaved = !saveWorkspaceState(storage, state);
    };
    const scheduleSave = () => {
      unsaved = true;
      if (!storage) return;
      if (saveTimer !== undefined) clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
    };
    // 保存できなかった編集が残る場合だけ、離脱前に確認ダイアログを出す。
    const onBeforeUnload = (event: BeforeUnloadEvent) => { flush(); if (unsaved) event.preventDefault(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
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
      const roots = workspace.getAllBlocks(false).filter((block) => block.type === "program_start" && block.isEnabled());
      const reachable = new Set(roots.flatMap((root) => root.getDescendants(false).map((block) => block.id)));
      for (const block of workspace.getAllBlocks(false)) block.setWarningText(reachable.has(block.id) ? null : "開始につながっていないため実行されません。", "unconnected");
    };
    workspace.addChangeListener((event) => {
      if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
      if (restoring) { warnings(); return; }
      ++revision; workspace?.highlightBlock(null); props.onEdit(revision); warnings(); scheduleSave();
    });
    warnings();
    props.onReady({ compile: () => compileWorkspace(workspace!, deviceStore.devices), revision: () => revision, highlight: (id) => workspace?.highlightBlock(id) });

    // Observe the allocated panel, including layout changes at breakpoints.
    resizeObserver = new ResizeObserver(() => {
      if (workspace) Blockly.svgResize(workspace);
    });
    resizeObserver.observe(container);
  });

  // カタログはESP32から遅れて届く。届いた分だけ部品カテゴリを作り直す。
  createEffect(() => {
    // Read only descriptor fields so sensor SSE updates do not rebuild the toolbox.
    const catalog = deviceStore.devices.map((d) => ({ id: d.id, label: d.label, type: d.type, unit: d.unit, kind: d.kind, control: d.control, state: {} }));
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
      class="blockly-editor"
      aria-label="ブロック編集エリア"
    />
  );
}
