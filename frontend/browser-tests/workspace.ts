// Loaded only by Playwright through the Vite development server. No production hook.
import * as Blockly from "blockly/core";

export function deviceFields(flyout = false) {
  const main = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
  const workspace = flyout ? main.getFlyout()!.getWorkspace() : main;
  return workspace.getAllBlocks(false).flatMap((block) => {
    const field = block.getField("DEVICE");
    return field ? [{ id: block.id, value: field.getValue(), text: field.getText() }] : [];
  });
}

export function loadScenario(name: "blink" | "forever" | "error") {
  const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg;
  workspace.clear();
  const make = (type: string, id: string) => {
    const block = workspace.newBlock(type, id);
    block.initSvg();
    block.render();
    return block;
  };
  const join = (a: Blockly.Block, b: Blockly.Block) =>
    a.nextConnection!.connect(b.previousConnection!);
  const start = make("program_start", "start");
  if (name === "error") {
    const repeat = make("controls_repeat_ext", "repeat");
    const divide = make("math_arithmetic", "divide");
    divide.setFieldValue("DIVIDE", "OP");
    const one = make("math_number", "one");
    one.setFieldValue(1, "NUM");
    const zero = make("math_number", "zero");
    zero.setFieldValue(0, "NUM");
    divide.getInput("A")!.connection!.connect(one.outputConnection!);
    divide.getInput("B")!.connection!.connect(zero.outputConnection!);
    repeat.getInput("TIMES")!.connection!.connect(divide.outputConnection!);
    join(start, repeat);
  } else {
    const on = make("device_set", "on");
    on.setFieldValue("led_red", "DEVICE");
    on.setFieldValue("ON", "STATE");
    join(start, on);
    if (name === "forever") join(on, make("program_forever", "forever"));
    else {
      const wait = make("sleep_ms", "wait");
      wait.setFieldValue(1, "TIME");
      const off = make("device_set", "off");
      off.setFieldValue("led_red", "DEVICE");
      off.setFieldValue("OFF", "STATE");
      join(on, wait);
      join(wait, off);
    }
  }
}

export function editOutput() {
  Blockly.getMainWorkspace().getBlockById("on")!.setFieldValue("OFF", "STATE");
}

export function editError() {
  Blockly.getMainWorkspace().getBlockById("zero")!.setFieldValue(1, "NUM");
}
