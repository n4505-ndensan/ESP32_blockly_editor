import { createEffect, onCleanup, onMount } from "solid-js";
import * as Blockly from "blockly/core";
import { blocks } from "blockly/blocks";
import * as ja from "blockly/msg/ja";
import { configureDeviceBlocks } from "../blockly/deviceBlocks";
import { createToolbox } from "../blockly/toolbox";
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

export type EditorHandle = { compile: () => Program; revision: () => number; highlight: (blockId: string | null) => void };
export default function BlocklyEditor(props: { onReady: (editor: EditorHandle) => void; onEdit: (revision: number) => void }) {
  let container!: HTMLDivElement;
  let workspace: Blockly.WorkspaceSvg | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let revision = 0;

  onMount(() => {
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
    const start = workspace.newBlock("program_start"); start.initSvg(); start.render(); start.moveBy(35, 35);
    const warnings = () => {
      if (!workspace) return;
      const roots = workspace.getAllBlocks(false).filter((block) => block.type === "program_start" && block.isEnabled());
      const reachable = new Set(roots.flatMap((root) => root.getDescendants(false).map((block) => block.id)));
      for (const block of workspace.getAllBlocks(false)) block.setWarningText(reachable.has(block.id) ? null : "開始につながっていないため実行されません。", "unconnected");
    };
    workspace.addChangeListener((event) => {
      if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
      ++revision; workspace?.highlightBlock(null); props.onEdit(revision); warnings();
    });
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
    const catalog = deviceStore.devices.map((d) => ({ id: d.id, label: d.label, description: d.description, unit: d.unit, kind: d.kind, control: d.control, state: {} }));
    configureDeviceBlocks(catalog);
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
