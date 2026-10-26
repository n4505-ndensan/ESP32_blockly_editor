import { describe, expect, it } from "vitest";
import fixtures from "../../shared/program-fixtures.json";
import { dummyCatalog } from "../src/device/dummyCatalog";
import { LIMITS, ProgramValidationError } from "../src/program/types";
import { validateProgram } from "../src/program/validate";

const devices = dummyCatalog();
describe("AST contract shared with the firmware", () => {
  for (const fixture of fixtures)
    it(fixture.name, () => {
      const check = () => validateProgram(fixture.program, devices);
      if (fixture.valid) expect(check).not.toThrow();
      else expect(check).toThrow(ProgramValidationError);
    });
  it("accepts 256 nodes and rejects the 257th", () => {
    const program = {
      version: 1,
      body: Array.from({ length: LIMITS.nodes }, (_, i) => ({
        type: "wait",
        blockId: String(i),
        ms: 0,
      })),
    };
    expect(() => validateProgram(program, devices)).not.toThrow();
    program.body.push({ type: "wait", blockId: "extra", ms: 0 });
    expect(() => validateProgram(program, devices)).toThrow("上限");
  });
  it("bounds nesting including expression nodes", () => {
    let node: unknown = { type: "wait", blockId: "wait", ms: 0 };
    for (let i = 1; i < LIMITS.depth; i++)
      node = { type: "forever", blockId: String(i), body: [node] };
    expect(() =>
      validateProgram({ version: 1, body: [node] }, devices),
    ).not.toThrow();
    expect(() =>
      validateProgram(
        {
          version: 1,
          body: [{ type: "forever", blockId: "extra", body: [node] }],
        },
        devices,
      ),
    ).toThrow("上限");
  });
  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite literal %s",
    (value) => {
      expect(() =>
        validateProgram(
          {
            version: 1,
            body: [
              {
                type: "repeat",
                blockId: "r",
                count: { type: "number", blockId: "n", value },
                body: [],
              },
            ],
          },
          devices,
        ),
      ).toThrow();
    },
  );
  it("reports the source block, not just a generic error", () => {
    try {
      validateProgram(
        {
          version: 1,
          body: [{ type: "wait", blockId: "broken-wait", ms: -1 }],
        },
        devices,
      );
    } catch (error) {
      expect((error as ProgramValidationError).detail.blockId).toBe(
        "broken-wait",
      );
      return;
    }
    throw new Error("validation should fail");
  });
  it("counts UTF-8 payload bytes", () => {
    const program = {
      version: 1,
      body: [{ type: "wait", blockId: "w", ms: 0 }],
      extra: "あ".repeat(12000),
    };
    expect(() => validateProgram(program, devices)).toThrow("32KiB");
  });
});
