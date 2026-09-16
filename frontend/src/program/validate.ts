import type { Device } from "../device/types";
import { LIMITS, ProgramValidationError } from "./types";
import type { Program } from "./types";

type RecordValue = Record<string, unknown>;
const bytes = (value: string) => new TextEncoder().encode(value).length;

/** The device applies the same checks again; this validator supplies editor diagnostics. */
export function validateProgram(value: unknown, devices: readonly Device[]): asserts value is Program {
  let count = 0;
  const fail = (message: string, node?: RecordValue, code = "invalid_program"): never => {
    throw new ProgramValidationError({ code, message, blockId: typeof node?.blockId === "string" ? node.blockId : undefined });
  };
  const object = (value: unknown): RecordValue => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("ブロックの形式が不正です。");
    return value as RecordValue;
  };
  const node = (value: unknown, depth: number) => {
    const n = object(value);
    if (++count > LIMITS.nodes || depth > LIMITS.depth) fail("プログラムの大きさ・深さが上限を超えています。", n, "program_too_large");
    if (typeof n.blockId !== "string" || !n.blockId || n.blockId.includes("\0") || bytes(n.blockId) > LIMITS.blockIdBytes) fail("ブロックIDが不正です。", n);
    return n;
  };
  const device = (n: RecordValue, kind: "sensor" | "output") => {
    const d = devices.find((item) => item.id === n.deviceId);
    if (!d || d.kind !== kind || (kind === "output" && d.control !== "switch")) fail("選択した部品はこの操作に対応していません。", n);
  };
  const integer = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= LIMITS.integer;
  const expression = (value: unknown, depth: number): "number" | "boolean" => {
    const n = node(value, depth);
    switch (n.type) {
      case "number":
        if (typeof n.value !== "number" || !Number.isFinite(n.value)) fail("有限の数値を指定してください。", n);
        return "number";
      case "boolean":
        if (typeof n.value !== "boolean") fail("真偽値を指定してください。", n);
        return "boolean";
      case "sensor": device(n, "sensor"); return "number";
      case "not":
        if (expression(n.operand, depth + 1) !== "boolean") fail("条件には真偽値が必要です。", n);
        return "boolean";
      case "arithmetic": case "compare": case "logic": {
        const left = expression(n.left, depth + 1);
        const right = expression(n.right, depth + 1);
        if (n.type === "arithmetic") {
          if (left !== "number" || right !== "number" || !["ADD", "MINUS", "MULTIPLY", "DIVIDE", "POWER"].includes(String(n.op))) fail("数値演算が不正です。", n);
          return "number";
        }
        if (n.type === "logic") {
          if (left !== "boolean" || right !== "boolean" || !["AND", "OR"].includes(String(n.op))) fail("論理演算には真偽値が必要です。", n);
        } else if (left !== right || !["EQ", "NEQ", "LT", "LTE", "GT", "GTE"].includes(String(n.op)) || (left === "boolean" && n.op !== "EQ" && n.op !== "NEQ")) fail("比較する値の型・演算が不正です。", n);
        return "boolean";
      }
      default: return fail("対応していない式です。", n);
    }
  };
  const body = (value: unknown, depth: number) => {
    if (!Array.isArray(value)) return fail("処理の並びが不正です。");
    for (const item of value) {
      const n = node(item, depth);
      switch (n.type) {
        case "set_output":
          device(n, "output");
          if (typeof n.on !== "boolean") fail("ON/OFFの指定が不正です。", n);
          break;
        case "wait": if (!integer(n.ms)) fail("待機時間が範囲外です。", n); break;
        case "if":
          if (expression(n.condition, depth + 1) !== "boolean") fail("条件には真偽値が必要です。", n);
          body(n.then, depth + 1); body(n.else, depth + 1); break;
        case "repeat":
          if (expression(n.count, depth + 1) !== "number") fail("回数には数値が必要です。", n);
          if (object(n.count).type === "number" && !integer(object(n.count).value)) fail("回数は0以上の整数にしてください。", n);
          body(n.body, depth + 1); break;
        case "while":
          if (expression(n.condition, depth + 1) !== "boolean") fail("条件には真偽値が必要です。", n);
          body(n.body, depth + 1); break;
        case "forever": body(n.body, depth + 1); break;
        default: fail("対応していない処理です。", n);
      }
    }
  };
  const root = object(value);
  if (root.version !== 1) fail("未対応のプログラム形式です。");
  if (!Array.isArray(root.body) || root.body.length === 0) fail("開始ブロックに処理を接続してください。");
  body(root.body, 1);
  if (bytes(JSON.stringify(value)) > LIMITS.bytes) fail("送信サイズが32KiBを超えています。", undefined, "program_too_large");
}
