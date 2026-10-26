import { blocks } from "blockly/blocks";
import * as Blockly from "blockly/core";
import * as ja from "blockly/msg/ja";

// Shared by every injected workspace (the editor and template previews).
Blockly.setLocale(ja);
for (const [name, definition] of Object.entries(blocks))
  if (!Blockly.Blocks[name]) Blockly.Blocks[name] = definition;

export const theme = Blockly.Theme.defineTheme("workspace", {
  name: "workspace",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#fafcfc",
    toolboxBackgroundColour: "#f0f4f3",
    toolboxForegroundColour: "#354b46",
    flyoutBackgroundColour: "#e7eeec",
    flyoutForegroundColour: "#354b46",
    flyoutOpacity: 0.75,
    scrollbarColour: "#a5b9b2",
  },
  fontStyle: { family: "system-ui, sans-serif", size: 12 },
});

const FLYOUT_SCALE = 0.9;
// Extra space above the first block, in screen pixels.
const FLYOUT_TOP_PADDING = 8;

// Keeps the palette at a fixed size; the default follows the workspace zoom.
export class FixedScaleFlyout extends Blockly.VerticalFlyout {
  override getFlyoutScale() {
    return FLYOUT_SCALE;
  }

  protected override layout_(contents: Blockly.FlyoutItem[]) {
    super.layout_(contents);
    const dy = FLYOUT_TOP_PADDING / FLYOUT_SCALE;
    for (const item of contents) item.getElement().moveBy(0, dy);
  }
}
