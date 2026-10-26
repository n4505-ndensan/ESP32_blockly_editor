import { blocks } from "blockly/blocks";
import * as Blockly from "blockly/core";
import * as ja from "blockly/msg/ja";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureDeviceBlocks } from "../src/blockly/deviceBlocks";
import { dummyCatalog } from "../src/device/dummyCatalog";
import { compileWorkspace } from "../src/program/compile";

Blockly.setLocale(ja);
for (const [name, definition] of Object.entries(blocks))
  if (!Blockly.Blocks[name]) Blockly.Blocks[name] = definition;
let workspace: Blockly.Workspace;
const devices = dummyCatalog();
beforeEach(() => {
  configureDeviceBlocks(devices);
  workspace = new Blockly.Workspace();
});
afterEach(() => workspace.dispose());
const block = (type: string) => workspace.newBlock(type);
const join = (a: Blockly.Block, b: Blockly.Block) =>
  a.nextConnection!.connect(b.previousConnection!);
const input = (parent: Blockly.Block, name: string, child: Blockly.Block) =>
  parent.getInput(name)!.connection!.connect(child.outputConnection!);

describe("Blockly -> AST", () => {
  it("requires exactly one non-empty start", () => {
    expect(() => compileWorkspace(workspace, devices)).toThrow("開始");
    block("program_start");
    expect(() => compileWorkspace(workspace, devices)).toThrow("接続");
    block("program_start");
    expect(() => compileWorkspace(workspace, devices)).toThrow("1つ");
  });
  it("compiles connected output/wait statements in order, ignoring loose drafts", () => {
    const start = block("program_start"),
      on = block("device_set"),
      wait = block("sleep_ms");
    on.setFieldValue("led_red", "DEVICE");
    on.setFieldValue("ON", "STATE");
    wait.setFieldValue(0.25, "TIME");
    join(start, on);
    join(on, wait);
    block("device_set");
    expect(compileWorkspace(workspace, devices)).toEqual({
      version: 1,
      body: [
        { type: "set_output", blockId: on.id, deviceId: "led_red", on: true },
        { type: "wait", blockId: wait.id, ms: 250 },
      ],
    });
  });
  it("compiles sensor comparison inside a forever loop", () => {
    const start = block("program_start"),
      forever = block("program_forever"),
      condition = block("controls_if");
    join(start, forever);
    forever.getInput("DO")!.connection!.connect(condition.previousConnection!);
    const compare = block("logic_compare"),
      sensor = block("device_sensor"),
      number = block("math_number");
    compare.setFieldValue("LT", "OP");
    sensor.setFieldValue("distance", "DEVICE");
    number.setFieldValue(200, "NUM");
    input(compare, "A", sensor);
    input(compare, "B", number);
    input(condition, "IF0", compare);
    const result = compileWorkspace(workspace, devices);
    expect(result.body[0]).toMatchObject({
      type: "forever",
      body: [
        {
          type: "if",
          condition: {
            type: "compare",
            op: "LT",
            left: { type: "sensor", deviceId: "distance" },
            right: { type: "number", value: 200 },
          },
          then: [],
          else: [],
        },
      ],
    });
  });
  it("reports an unconnected required expression", () => {
    const start = block("program_start"),
      repeat = block("controls_repeat_ext");
    join(start, repeat);
    expect(() => compileWorkspace(workspace, devices)).toThrow("入力");
  });
  it.each(["ADD", "MINUS", "MULTIPLY", "DIVIDE", "POWER"])(
    "supports arithmetic %s",
    (op) => {
      const start = block("program_start"),
        repeat = block("controls_repeat_ext"),
        math = block("math_arithmetic");
      join(start, repeat);
      math.setFieldValue(op, "OP");
      input(math, "A", block("math_number"));
      input(math, "B", block("math_number"));
      input(repeat, "TIMES", math);
      expect(compileWorkspace(workspace, devices).body[0]).toMatchObject({
        type: "repeat",
        count: { type: "arithmetic", op },
      });
    },
  );
  it("normalizes until as negated while", () => {
    const start = block("program_start"),
      loop = block("controls_whileUntil");
    join(start, loop);
    loop.setFieldValue("UNTIL", "MODE");
    input(loop, "BOOL", block("logic_boolean"));
    expect(compileWorkspace(workspace, devices).body[0]).toMatchObject({
      type: "while",
      condition: { type: "not", operand: { type: "boolean", value: true } },
    });
  });
  it("accepts catalog additions without a new block definition", () => {
    const catalog = [
      ...devices,
      { ...devices[0], id: "new_output", label: "追加部品" },
    ];
    configureDeviceBlocks(catalog);
    const start = block("program_start"),
      output = block("device_set");
    output.setFieldValue("new_output", "DEVICE");
    join(start, output);
    expect(compileWorkspace(workspace, catalog).body[0]).toMatchObject({
      deviceId: "new_output",
    });
    expect(() => compileWorkspace(workspace, devices)).toThrow("部品");
  });
  it("compiles else-if and else in priority order", () => {
    const start = block("program_start"),
      condition = block("controls_if");
    join(start, condition);
    condition.loadExtraState!({ elseIfCount: 1, hasElse: true });
    input(condition, "IF0", block("logic_boolean"));
    input(condition, "IF1", block("logic_boolean"));
    const fallback = block("sleep_ms");
    condition
      .getInput("ELSE")!
      .connection!.connect(fallback.previousConnection!);
    expect(compileWorkspace(workspace, devices).body[0]).toMatchObject({
      type: "if",
      else: [{ type: "if", else: [{ type: "wait", ms: 1000 }] }],
    });
  });
  it.each(["EQ", "NEQ", "LT", "LTE", "GT", "GTE"])(
    "supports comparison %s",
    (op) => {
      const start = block("program_start"),
        condition = block("controls_if"),
        compare = block("logic_compare");
      join(start, condition);
      compare.setFieldValue(op, "OP");
      input(compare, "A", block("math_number"));
      input(compare, "B", block("math_number"));
      input(condition, "IF0", compare);
      expect(compileWorkspace(workspace, devices).body[0]).toMatchObject({
        condition: { type: "compare", op },
      });
    },
  );
  it.each(["AND", "OR"])("supports logic %s", (op) => {
    const start = block("program_start"),
      condition = block("controls_if"),
      logic = block("logic_operation");
    join(start, condition);
    logic.setFieldValue(op, "OP");
    input(logic, "A", block("logic_boolean"));
    input(logic, "B", block("logic_boolean"));
    input(condition, "IF0", logic);
    expect(compileWorkspace(workspace, devices).body[0]).toMatchObject({
      condition: { type: "logic", op },
    });
  });
  it("skips disabled statements but follows their next connection", () => {
    const start = block("program_start"),
      unused = block("device_set"),
      wait = block("sleep_ms");
    join(start, unused);
    join(unused, wait);
    unused.setDisabledReason(true, "test");
    expect(compileWorkspace(workspace, devices).body).toHaveLength(1);
    expect(compileWorkspace(workspace, devices).body[0].type).toBe("wait");
  });
  it("rejects unsupported connected standard blocks", () => {
    const start = block("program_start"),
      unsupported = block("text_print");
    join(start, unsupported);
    expect(() => compileWorkspace(workspace, devices)).toThrow(
      "対応していない",
    );
  });
});
