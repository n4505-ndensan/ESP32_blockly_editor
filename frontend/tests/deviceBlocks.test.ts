import * as Blockly from "blockly/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureDeviceBlocks } from "../src/blockly/deviceBlocks";
import { dummyCatalog } from "../src/device/dummyCatalog";
import { compileWorkspace } from "../src/program/compile";

const devices = dummyCatalog();
let workspace: Blockly.Workspace;

beforeEach(() => {
  configureDeviceBlocks(devices);
  workspace = new Blockly.Workspace();
});
afterEach(() => workspace.dispose());

describe("device dropdown restoration", () => {
  it.each([
    ["device_set", "led_white"],
    ["device_set", "led_blue"],
    ["device_sensor", "distance"],
  ])("preserves %s's %s before the catalog arrives", (type, deviceId) => {
    const block = workspace.newBlock(type, "saved");
    block.setFieldValue(deviceId, "DEVICE");
    const state = Blockly.serialization.workspaces.save(workspace);
    workspace.clear();
    configureDeviceBlocks([]);
    const warning = vi.spyOn(console, "warn");

    Blockly.serialization.workspaces.load(state, workspace);

    const field = workspace.getBlockById("saved")!.getField("DEVICE")!;
    expect(field.getValue()).toBe(deviceId);
    expect(field.getText()).toContain("未接続");
    expect(Blockly.serialization.workspaces.save(workspace)).toEqual(state);
    expect(warning).not.toHaveBeenCalled();

    configureDeviceBlocks(devices, workspace);
    expect(field.getValue()).toBe(deviceId);
    expect(field.getText()).toContain(
      devices.find((device) => device.id === deviceId)!.label,
    );
    expect(field.getText()).not.toContain("未接続");
  });

  it("keeps missing IDs and updates labels without changing the selected device", () => {
    const start = workspace.newBlock("program_start");
    const block = workspace.newBlock("device_set");
    block.setFieldValue("led_blue", "DEVICE");
    start.nextConnection!.connect(block.previousConnection!);
    const state = Blockly.serialization.workspaces.save(workspace);
    workspace.clear();
    const remaining = devices.filter((device) => device.id !== "led_blue");
    configureDeviceBlocks(remaining);
    Blockly.serialization.workspaces.load(state, workspace);

    const restored = workspace.getBlockById(block.id)!;
    const field = restored.getField("DEVICE")!;
    expect(field.getValue()).toBe("led_blue");
    expect(field.getText()).toContain("未接続");
    expect(() => compileWorkspace(workspace, remaining)).toThrow("部品");

    const renamed = devices.map((device) =>
      device.id === "led_blue" ? { ...device, label: "Renamed LED" } : device,
    );
    configureDeviceBlocks(renamed, workspace);
    expect(field.getValue()).toBe("led_blue");
    expect(field.getText()).toBe("Renamed LED");
    expect(compileWorkspace(workspace, renamed).body[0]).toMatchObject({
      deviceId: "led_blue",
    });

    configureDeviceBlocks(remaining, workspace);
    expect(field.getValue()).toBe("led_blue");
    expect(field.getText()).toContain("未接続");
  });
});
