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
    flyoutOpacity: 1,
    scrollbarColour: "#a5b9b2",
  },
  fontStyle: { family: "system-ui, sans-serif", size: 12 },
});
