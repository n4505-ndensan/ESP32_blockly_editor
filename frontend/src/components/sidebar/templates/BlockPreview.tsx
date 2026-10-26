import { css } from "@acab/ecsstatic";
import * as Blockly from "blockly/core";
import { onCleanup, onMount } from "solid-js";
import { configureDeviceBlocks } from "~/blockly/deviceBlocks";
import { theme } from "~/blockly/setup";
import { deviceStore } from "~/store/deviceStore";

const PADDING = 8;

const preview = css`
  margin: 4px;
  border-radius: 4px;
  overflow: hidden;

  & .blocklySvg {
    border: 0;
  }
`;

/** Renders a block stack as real Blockly SVG in a fixed, read-only workspace. */
export default function BlockPreview(props: {
  state: Blockly.serialization.blocks.State;
}) {
  let container!: HTMLDivElement;
  let workspace: Blockly.WorkspaceSvg | undefined;
  let resizeObserver: ResizeObserver | undefined;

  // Shrink to the card width (never enlarge) and size the height to the content.
  const fit = () => {
    if (!workspace) return;
    const box = workspace.getBlocksBoundingBox();
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    const scale = Math.min(1, (container.clientWidth - PADDING * 2) / width);
    workspace.setScale(scale);
    container.style.height = `${height * scale + PADDING * 2}px`;
    Blockly.svgResize(workspace);
    workspace.translate(
      -box.left * scale + PADDING,
      -box.top * scale + PADDING,
    );
  };

  onMount(() => {
    // Registers device blocks when this mounts before the editor does.
    configureDeviceBlocks(deviceStore.devices);
    workspace = Blockly.inject(container, {
      readOnly: true,
      theme,
      media: `${import.meta.env.BASE_URL}blockly_media/`,
      sounds: false,
      move: { scrollbars: false, drag: false, wheel: false },
      zoom: { controls: false, wheel: false, startScale: 1 },
    });
    Blockly.serialization.blocks.append(props.state, workspace);
    fit();
    let lastWidth = container.clientWidth;
    resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth === lastWidth) return;
      lastWidth = container.clientWidth;
      fit();
    });
    resizeObserver.observe(container);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    workspace?.dispose();
  });

  return <div ref={container} class={preview} />;
}
