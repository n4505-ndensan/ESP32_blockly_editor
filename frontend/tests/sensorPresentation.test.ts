import { describe, expect, it } from "vitest";
import { sensorPresentation } from "../src/device/sensorPresentation";

describe("sensor presentation", () => {
  it.each(["ok", "held"] as const)(
    "shows numeric %s values, including zero",
    (status) => {
      expect(sensorPresentation("distance", { status, value: 123 })).toEqual({
        value: 123,
        caption: status === "held" ? "直近値を使用中" : null,
      });
      expect(sensorPresentation("distance", { status, value: 0 }).value).toBe(
        0,
      );
      expect(
        sensorPresentation("temperature", { status, value: 24.5 }).value,
      ).toBe("24.50");
    },
  );

  it.each([
    ["stale", "値が更新されていません"],
    ["unavailable", "取得できません"],
  ] as const)(
    "hides even a retained numeric value when %s",
    (status, caption) => {
      expect(sensorPresentation("distance", { status, value: 123 })).toEqual({
        value: "--",
        caption,
      });
      expect(sensorPresentation("distance", { status, value: null })).toEqual({
        value: "--",
        caption,
      });
    },
  );

  it("does not invent a value for missing or null readings", () => {
    expect(sensorPresentation("distance", {})).toEqual({
      value: "--",
      caption: "取得できません",
    });
    for (const status of ["ok", "held"] as const) {
      expect(
        sensorPresentation("distance", { status, value: null }).value,
      ).toBe("--");
      expect(sensorPresentation("temperature", { status }).value).toBe("--");
    }
  });

  it("reflects held, stale, hard invalidation and fresh recovery without caching", () => {
    expect(
      sensorPresentation("distance", { status: "held", value: 90 }).caption,
    ).toBe("直近値を使用中");
    expect(
      sensorPresentation("distance", { status: "stale", value: null }).value,
    ).toBe("--");
    expect(
      sensorPresentation("distance", { status: "unavailable", value: null })
        .value,
    ).toBe("--");
    expect(
      sensorPresentation("distance", { status: "ok", value: 110 }),
    ).toEqual({ value: 110, caption: null });
  });
});
