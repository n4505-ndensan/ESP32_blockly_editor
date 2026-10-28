export const LIMITS = {
  bytes: 32 * 1024,
  nodes: 256,
  depth: 16,
  blockIdBytes: 64,
  integer: 0x7fffffff,
} as const;

type Source = { blockId: string };
export type ArithmeticOp = "ADD" | "MINUS" | "MULTIPLY" | "DIVIDE" | "POWER";
export type CompareOp = "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE";
export type Expression = Source &
  (
    | { type: "number"; value: number }
    | { type: "boolean"; value: boolean }
    | { type: "sensor"; deviceId: string }
    | {
        type: "arithmetic";
        op: ArithmeticOp;
        left: Expression;
        right: Expression;
      }
    | { type: "compare"; op: CompareOp; left: Expression; right: Expression }
    | { type: "logic"; op: "AND" | "OR"; left: Expression; right: Expression }
    | { type: "not"; operand: Expression }
  );
export type Statement = Source &
  (
    | { type: "set_output"; deviceId: string; on: boolean }
    | { type: "wait"; ms: number }
    | {
        type: "if";
        condition: Expression;
        then: Statement[];
        else: Statement[];
      }
    | { type: "repeat"; count: Expression; body: Statement[] }
    | { type: "while"; condition: Expression; body: Statement[] }
    | { type: "forever"; body: Statement[] }
  );
export type Program = { version: 1; body: Statement[] };
export type ProgramError = { code: string; message: string; blockId?: string };
export type ProgramStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "stopped"
  | "error";
/** Sensor a running program is waiting on until it reports a usable value. */
export type SensorWait = { deviceId: string; blockId: string };
export type ProgramState = {
  bootId: string;
  revision: number;
  runId: number;
  state: ProgramStatus;
  error: ProgramError | null;
  /** Absent from firmware that predates sensor waits. */
  waiting?: SensorWait | null;
};
export const isActive = (state?: ProgramStatus) =>
  state === "starting" || state === "running" || state === "stopping";

export class ProgramValidationError extends Error {
  constructor(public readonly detail: ProgramError) {
    super(detail.message);
  }
}
