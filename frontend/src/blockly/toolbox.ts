import type { utils } from "blockly/core";
import type { Device } from "../device/types";

export function createToolbox(
  devices: readonly Device[],
): utils.toolbox.ToolboxDefinition {
  return {
    kind: "categoryToolbox",
    contents: [
      {
        kind: "category",
        name: "実行",
        colour: "#438568",
        contents: [
          { kind: "block", type: "program_start" },
          { kind: "block", type: "sleep_ms" },
        ],
      },
      {
        kind: "category",
        name: "条件",
        categorystyle: "logic_category",
        contents: [
          { kind: "block", type: "controls_if" },
          { kind: "block", type: "logic_compare" },
          { kind: "block", type: "logic_operation" },
          { kind: "block", type: "logic_boolean" },
        ],
      },
      {
        kind: "category",
        name: "繰り返し",
        categorystyle: "loop_category",
        contents: [
          {
            kind: "block",
            type: "controls_repeat_ext",
            inputs: {
              TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } },
            },
          },
          { kind: "block", type: "controls_whileUntil" },
          { kind: "block", type: "program_forever" },
        ],
      },
      {
        kind: "category",
        name: "数値",
        categorystyle: "math_category",
        contents: [
          { kind: "block", type: "math_number" },
          { kind: "block", type: "math_arithmetic" },
        ],
      },
      {
        kind: "category",
        name: "センサ",
        colour: "#5b67a5",
        contents: devices
          .filter((d) => d.kind === "sensor")
          .map((d) => ({
            kind: "block",
            type: "device_sensor",
            fields: { DEVICE: d.id },
          })),
      },
      {
        kind: "category",
        name: "出力",
        colour: "#d47b25",
        contents: devices
          .filter((d) => d.kind === "output" && d.control === "switch")
          .map((d) => ({
            kind: "block",
            type: "device_set",
            fields: { DEVICE: d.id },
          })),
      },
    ],
  };
}
