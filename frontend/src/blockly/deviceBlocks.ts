import * as Blockly from "blockly/core";

// 実機との接続前に、部品を扱うプログラムの組み立てを確認するための固定ブロック。
// 実機連携時には、GET /api/devices のカタログを元にツールボックスを組み立てる。
Blockly.defineBlocksWithJsonArray([
  {
    type: "device_temperature",
    message0: "温度 (℃)",
    output: "Number",
    colour: 230,
    tooltip: "温度センサの値を読み取ります",
    helpUrl: "",
  },
  {
    type: "device_distance",
    message0: "距離 (mm)",
    output: "Number",
    colour: 230,
    tooltip: "距離センサの値を読み取ります",
    helpUrl: "",
  },
  {
    type: "device_led_on",
    message0: "%1 LEDを点灯",
    args0: [
      {
        type: "field_dropdown",
        name: "DEVICE",
        options: [
          ["白色", "led_white"],
          ["赤色", "led_red"],
          ["緑色", "led_green"],
          ["黄色", "led_yellow"],
          ["青色", "led_blue"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 20,
    tooltip: "選んだLEDを点灯します",
    helpUrl: "",
  },
  {
    type: "device_led_off",
    message0: "%1 LEDを消灯",
    args0: [
      {
        type: "field_dropdown",
        name: "DEVICE",
        options: [
          ["白色", "led_white"],
          ["赤色", "led_red"],
          ["緑色", "led_green"],
          ["黄色", "led_yellow"],
          ["青色", "led_blue"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 20,
    tooltip: "選んだLEDを消灯します",
    helpUrl: "",
  },
  {
    type: "device_buzzer_on",
    message0: "ブザーをON",
    previousStatement: null,
    nextStatement: null,
    colour: 290,
    tooltip: "ブザーを鳴らします",
    helpUrl: "",
  },
  {
    type: "device_buzzer_off",
    message0: "ブザーをOFF",
    previousStatement: null,
    nextStatement: null,
    colour: 290,
    tooltip: "ブザーを止めます",
    helpUrl: "",
  },
  {
    type: "sleep_ms",
    message0: "%1 秒間停止",
    args0: [
      {
        type: "field_number",
        name: "TIME",
        value: 1000,
        min: 0,
        max: 100000,
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 350,
    tooltip: "指定した秒数(ミリ秒)だけ止まります",
    helpUrl: "",
  },
]);
