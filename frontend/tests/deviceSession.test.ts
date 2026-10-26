import { expect, it } from "vitest";
import { DeviceRevisions, deviceSource } from "../src/device/session";
it("selects real hardware only for an explicit dev target or device hosting", () => {
  expect(deviceSource(true, "localhost", "")).toBe("dummy");
  expect(deviceSource(true, "192.168.1.10", "")).toBe("dummy");
  expect(deviceSource(true, "localhost", "http://esp32")).toBe("sse");
  expect(deviceSource(false, "localhost", "")).toBe("dummy");
  expect(deviceSource(false, "192.168.1.20", "")).toBe("sse");
});
it("orders device state per ID so an HTTP response cannot discard unrelated SSE changes", () => {
  const versions = new DeviceRevisions();
  versions.reset("a", 1, ["led", "sensor"]);
  expect(versions.accept("a", 5, "led")).toBe(true);
  expect(versions.accept("a", 4, "sensor")).toBe(true);
  expect(versions.accept("a", 4, "led")).toBe(false);
  expect(versions.accept("old-boot", 100, "led")).toBe(false);
  versions.reset("b", 0, ["led"]);
  expect(versions.accept("b", 1, "led")).toBe(true);
});
