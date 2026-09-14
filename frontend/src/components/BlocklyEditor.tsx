import { onCleanup, onMount } from "solid-js";
import * as Blockly from "blockly/core";
import { blocks } from "blockly/blocks";
import * as ja from "blockly/msg/ja";
import "../blockly/deviceBlocks";
import { toolbox } from "../blockly/toolbox";

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
      toolbox,
      theme,
      media: `${import.meta.env.BASE_URL}media/`,
      sounds: false,
      trashcan: true,
      grid: { spacing: 24, length: 2, colour: "#d9e3df", snap: false },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.9 },
    });

    // Observe the allocated panel, including layout changes at breakpoints.
    resizeObserver = new ResizeObserver(() => {
      if (workspace) Blockly.svgResize(workspace);
    });
    resizeObserver.observe(container);
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
