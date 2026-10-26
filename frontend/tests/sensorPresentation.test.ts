import { describe, expect, it } from "vitest";
import { sensorPresentation } from "../src/device/sensorPresentation";

describe("sensor presentation", () => {
  it.each(["ok", "held"] as const)(
    "shows numeric %s values, including zero",
    (status) => {
      expect(sensorPresentation("tof", { status, value: 123 })).toEqual({
        value: 123,
        caption: null,
      });
      expect(sensorPresentation("tof", { status, value: 0 }).value).toBe(0);
      expect(sensorPresentation("thermo", { status, value: 24.5 }).value).toBe(
        "24.50",
      );
    },
  );

  it.each([
    ["stale", "値が更新されていません"],
    ["unavailable", "取得できません"],
  ] as const)(
    "hides even a retained numeric value when %s",
    (status, caption) => {
      expect(sensorPresentation("tof", { status, value: 123 })).toEqual({
        value: "--",
        caption,
      });
      expect(sensorPresentation("tof", { status, value: null })).toEqual({
        value: "--",
        caption,
      });
    },
  );

  it("does not invent a value for missing or null readings", () => {
    expect(sensorPresentation("tof", {})).toEqual({
      value: "--",
      caption: "取得できません",
    });
    for (const status of ["ok", "held"] as const) {
      expect(sensorPresentation("tof", { status, value: null }).value).toBe(
        "--",
      );
      expect(sensorPresentation("thermo", { status }).value).toBe("--");
    }
  });

  it("reflects held, stale, hard invalidation and fresh recovery without caching", () => {
    expect(sensorPresentation("tof", { status: "held", value: 90 })).toEqual({
      value: 90,
      caption: null,
    });
    expect(
      sensorPresentation("tof", { status: "stale", value: null }).value,
    ).toBe("--");
    expect(
      sensorPresentation("tof", { status: "unavailable", value: null }).value,
    ).toBe("--");
    expect(sensorPresentation("tof", { status: "ok", value: 110 })).toEqual({
      value: 110,
      caption: null,
    });
  });
});
