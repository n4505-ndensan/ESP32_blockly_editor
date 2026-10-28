import { describe, expect, it } from "vitest";
import {
  sensorPresentation,
  sensorWaitPresentation,
} from "../src/device/sensorPresentation";

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

  it.each([
    ["no_target", "範囲内に対象物がありません"],
    ["sensor_fault", "センサが異常を報告しています"],
    ["disconnected", "センサと通信できません"],
    ["no_data", "測定値が届いていません"],
  ] as const)("captions the %s reason", (reason, caption) => {
    for (const status of ["unavailable", "stale"] as const)
      expect(
        sensorPresentation("tof", { status, value: null, reason }),
      ).toEqual({ value: "--", caption });
  });

  it("falls back to the status for a missing or unknown reason", () => {
    expect(
      sensorPresentation("tof", { status: "stale", value: null, reason: null })
        .caption,
    ).toBe("値が更新されていません");
    const future = {
      status: "unavailable",
      value: null,
      reason: "overheated",
    } as unknown as Parameters<typeof sensorPresentation>[1];
    expect(sensorPresentation("tof", future).caption).toBe("取得できません");
  });

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

describe("sensor wait presentation", () => {
  it.each(["disconnected", "sensor_fault"] as const)(
    "shows %s as an error",
    (reason) => {
      const wait = sensorWaitPresentation("距離センサ", reason);
      expect(wait.error).toBe(true);
      expect(wait.text).toContain("「距離センサ」");
    },
  );

  it.each(["no_target", "no_data", null, undefined] as const)(
    "shows %s as plain status text",
    (reason) => {
      const wait = sensorWaitPresentation("距離センサ", reason);
      expect(wait.error).toBe(false);
      expect(wait.text).toContain("「距離センサ」");
      expect(wait.text).toContain("待っています");
    },
  );

  it("names the missing target and asks to check the connection only when it is lost", () => {
    expect(sensorWaitPresentation("距離", "no_target").text).toContain(
      "対象物",
    );
    expect(sensorWaitPresentation("距離", "disconnected").text).toContain(
      "接続",
    );
    expect(sensorWaitPresentation("距離", "no_target").text).not.toContain(
      "接続",
    );
  });
});
