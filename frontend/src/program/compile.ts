import type * as Blockly from "blockly/core";
import type { Device } from "~/device/types";
import type {
  ArithmeticOp,
  CompareOp,
  Expression,
  Program,
  Statement,
} from "~/program/types";
import { LIMITS, ProgramValidationError } from "~/program/types";
import { validateProgram } from "~/program/validate";

export function compileWorkspace(
  workspace: Blockly.Workspace,
  devices: readonly Device[],
): Program {
  let visited = 0;
  const fail = (message: string, block?: Blockly.Block): never => {
    throw new ProgramValidationError({
      code: "invalid_program",
      message,
      blockId: block?.id,
    });
  };
  const guard = (block: Blockly.Block, depth: number) => {
    if (++visited > LIMITS.nodes || depth > LIMITS.depth)
      fail("プログラムの大きさ・深さが上限を超えています。", block);
  };
  const required = (block: Blockly.Block, name: string): Blockly.Block => {
    const child = block.getInputTargetBlock(name);
    if (!child || !child.isEnabled())
      return fail("必要な入力にブロックを接続してください。", block);
    return child;
  };
  const expression = (block: Blockly.Block, depth: number): Expression => {
    guard(block, depth);
    const blockId = block.id;
    const expr = (name: string) => expression(required(block, name), depth + 1);
    switch (block.type) {
      case "math_number":
        return {
          type: "number",
          blockId,
          value: Number(block.getFieldValue("NUM")),
        };
      case "logic_boolean":
        return {
          type: "boolean",
          blockId,
          value: block.getFieldValue("BOOL") === "TRUE",
        };
      case "device_sensor":
        return {
          type: "sensor",
          blockId,
          deviceId: block.getFieldValue("DEVICE"),
        };
      case "math_arithmetic":
        return {
          type: "arithmetic",
          blockId,
          op: block.getFieldValue("OP") as ArithmeticOp,
          left: expr("A"),
          right: expr("B"),
        };
      case "logic_compare":
        return {
          type: "compare",
          blockId,
          op: block.getFieldValue("OP") as CompareOp,
          left: expr("A"),
          right: expr("B"),
        };
      case "logic_operation":
        return {
          type: "logic",
          blockId,
          op: block.getFieldValue("OP") as "AND" | "OR",
          left: expr("A"),
          right: expr("B"),
        };
      default:
        return fail("対応していない値のブロックです。", block);
    }
  };
  const statements = (
    first: Blockly.Block | null,
    depth: number,
  ): Statement[] => {
    const body: Statement[] = [];
    for (let block = first; block; block = block.getNextBlock()) {
      if (!block.isEnabled()) continue;
      guard(block, depth);
      const current = block,
        blockId = block.id;
      const expr = (name: string) =>
        expression(required(current, name), depth + 1);
      const nested = (name: string) =>
        statements(current.getInputTargetBlock(name), depth + 1);
      switch (block.type) {
        case "device_set":
          body.push({
            type: "set_output",
            blockId,
            deviceId: block.getFieldValue("DEVICE"),
            on: block.getFieldValue("STATE") === "ON",
          });
          break;
        case "sleep_ms":
          body.push({
            type: "wait",
            blockId,
            ms: Math.round(Number(block.getFieldValue("TIME")) * 1000),
          });
          break;
        case "controls_repeat_ext":
          body.push({
            type: "repeat",
            blockId,
            count: expr("TIMES"),
            body: nested("DO"),
          });
          break;
        case "controls_whileUntil": {
          const until = block.getFieldValue("MODE") === "UNTIL";
          const condition = expression(
            required(block, "BOOL"),
            depth + (until ? 2 : 1),
          );
          body.push({
            type: "while",
            blockId,
            condition: until
              ? { type: "not", blockId, operand: condition }
              : condition,
            body: nested("DO"),
          });
          break;
        }
        case "program_forever":
          body.push({ type: "forever", blockId, body: nested("DO") });
          break;
        case "controls_if": {
          const branch = (index: number, branchDepth: number): Statement => {
            if (index > 0) guard(current, branchDepth);
            return {
              type: "if",
              blockId,
              condition: expression(
                required(current, `IF${index}`),
                branchDepth + 1,
              ),
              then: statements(
                current.getInputTargetBlock(`DO${index}`),
                branchDepth + 1,
              ),
              else: current.getInput(`IF${index + 1}`)
                ? [branch(index + 1, branchDepth + 1)]
                : statements(
                    current.getInputTargetBlock("ELSE"),
                    branchDepth + 1,
                  ),
            };
          };
          body.push(branch(0, depth));
          break;
        }
        default:
          fail("対応していない処理のブロックです。", block);
      }
    }
    return body;
  };
  const starts = workspace
    .getAllBlocks(false)
    .filter((block) => block.type === "program_start" && block.isEnabled());
  if (starts.length !== 1) fail("開始ブロックを1つ置いてください。", starts[1]);
  const program: Program = {
    version: 1,
    body: statements(starts[0].getNextBlock(), 1),
  };
  validateProgram(program, devices);
  return program;
}
