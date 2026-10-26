import type * as Blockly from "blockly/core";

type BlockState = Blockly.serialization.blocks.State;

export type Template = { caption: string; state: BlockState };

const setOutput = (
  device: string,
  state: "ON" | "OFF",
  next?: BlockState,
): BlockState => ({
  type: "device_set",
  fields: { DEVICE: device, STATE: state },
  ...(next && { next: { block: next } }),
});
const sleep = (seconds: number, next?: BlockState): BlockState => ({
  type: "sleep_ms",
  fields: { TIME: seconds },
  ...(next && { next: { block: next } }),
});
const number = (value: number): BlockState => ({
  type: "math_number",
  fields: { NUM: value },
});

// Device IDs follow the default part list. Other IDs render as "not connected".
export const templates: Template[] = [
  {
    caption: "LEDを点滅させ続ける",
    state: {
      type: "program_forever",
      inputs: {
        DO: {
          block: setOutput(
            "led_red",
            "ON",
            sleep(0.5, setOutput("led_red", "OFF", sleep(0.5))),
          ),
        },
      },
    },
  },
  {
    caption: "ブザーを3回鳴らす",
    state: {
      type: "controls_repeat_ext",
      inputs: {
        TIMES: { shadow: number(3) },
        DO: {
          block: setOutput(
            "buzzer",
            "ON",
            sleep(0.2, setOutput("buzzer", "OFF", sleep(0.2))),
          ),
        },
      },
    },
  },
  {
    caption: "近づくとLEDが光る",
    state: {
      type: "program_forever",
      inputs: {
        DO: {
          block: {
            type: "controls_if",
            extraState: { hasElse: true },
            inputs: {
              IF0: {
                block: {
                  type: "logic_compare",
                  fields: { OP: "LT" },
                  inputs: {
                    A: {
                      block: {
                        type: "device_sensor",
                        fields: { DEVICE: "distance" },
                      },
                    },
                    B: { block: number(100) },
                  },
                },
              },
              DO0: { block: setOutput("led_yellow", "ON") },
              ELSE: { block: setOutput("led_yellow", "OFF") },
            },
            next: { block: sleep(0.1) },
          },
        },
      },
    },
  },
];
