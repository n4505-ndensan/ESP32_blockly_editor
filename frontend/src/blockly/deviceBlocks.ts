import * as Blockly from "blockly/core";
import type { Device } from "../device/types";
import { LIMITS } from "../program/types";

let catalog: readonly Device[] = [];
let registered = false;
function options(this: Blockly.FieldDropdown, output: boolean): [string, string][] {
  const choices: [string, string][] = catalog
    .filter((d) => output ? d.kind === "output" && d.control === "switch" : d.kind === "sensor")
    .map((d) => [d.label + (d.unit ? ` (${d.unit})` : ""), d.id]);
  const current = this.getValue();
  if (current && !choices.some(([, id]) => id === current)) choices.push([`${current}（未接続）`, current]);
  return choices.length ? choices : [["部品なし", ""]];
}
export function configureDeviceBlocks(devices: readonly Device[]) {
  catalog = devices;
  if (registered) return;
  registered = true;
  Blockly.Blocks.device_sensor = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(function () { return options.call(this, false); }), "DEVICE");
      this.setOutput(true, "Number"); this.setColour(230);
      this.setTooltip("センサの最新値を読み取ります。取得できない場合は実行エラーになります。");
    },
  };
  Blockly.Blocks.device_set = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(function () { return options.call(this, true); }), "DEVICE")
        .appendField("を").appendField(new Blockly.FieldDropdown([["ON", "ON"], ["OFF", "OFF"]]), "STATE");
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(20);
    },
  };
  Blockly.defineBlocksWithJsonArray([
    { type: "program_start", message0: "開始", nextStatement: null, colour: 160, tooltip: "実行ボタンを押すと、ここにつながる処理を実行します。" },
    { type: "program_forever", message0: "ずっと %1 %2", args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: 120 },
    { type: "sleep_ms", message0: "%1 秒待つ", args0: [{ type: "field_number", name: "TIME", value: 1, min: 0, max: LIMITS.integer / 1000, precision: 0.001 }], previousStatement: null, nextStatement: null, colour: 350, tooltip: "指定した秒数だけ待機します。停止ボタンは待機中も使えます。" },
  ]);
}
