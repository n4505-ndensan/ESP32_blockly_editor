import type { utils } from "blockly/core";

export const toolbox: utils.toolbox.ToolboxDefinition = {
  kind: "categoryToolbox",
  contents: [
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
      contents: [
        { kind: "block", type: "device_temperature" },
        { kind: "block", type: "device_distance" },
      ],
    },
    {
      kind: "category",
      name: "LED",
      colour: "#d47b25",
      contents: [
        { kind: "block", type: "device_led_on" },
        { kind: "block", type: "device_led_off" },
      ],
    },
    {
      kind: "category",
      name: "ブザー",
      colour: "#9b59b6",
      contents: [
        { kind: "block", type: "device_buzzer_on" },
        { kind: "block", type: "device_buzzer_off" },
      ],
    },
    {
      kind: "category",
      name: "その他",
      colour: "#505050",
      contents: [
        {
          kind: "block",
          type: "sleep_ms",
        },
      ],
    },
  ],
};
