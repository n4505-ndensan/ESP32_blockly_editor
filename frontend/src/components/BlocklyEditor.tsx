import { createEffect, onCleanup, onMount } from "solid-js";
import * as Blockly from "blockly/core";
import { blocks } from "blockly/blocks";
import * as ja from "blockly/msg/ja";
import "../blockly/deviceBlocks";
import { createToolbox } from "../blockly/toolbox";
import { deviceStore } from "../store/deviceStore";

Blockly.setLocale(ja);
Blockly.common.defineBlocks(blocks);

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

export default function BlocklyEditor() {
  let container!: HTMLDivElement;
  let workspace: Blockly.WorkspaceSvg | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
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

    // Observe the allocated panel, including layout changes at breakpoints.
    resizeObserver = new ResizeObserver(() => {
      if (workspace) Blockly.svgResize(workspace);
    });
    resizeObserver.observe(container);
  });

  // カタログはESP32から遅れて届く。届いた分だけ部品カテゴリを作り直す。
  createEffect(() => {
    const toolbox = createToolbox(deviceStore.devices);
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
