import { describe, expect, it } from "vitest";
import type { StorageLike } from "../src/blockly/workspaceStorage";
import {
  STORAGE_KEY,
  clearWorkspaceState,
  hasBlocks,
  loadWorkspaceState,
  saveWorkspaceState,
} from "../src/blockly/workspaceStorage";

const memoryStorage = (
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
};
const failingStorage = (): StorageLike => ({
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
});

const state = { blocks: { blocks: [{ type: "program_start", id: "a" }] } };

describe("workspace storage", () => {
  it("round-trips the workspace state", () => {
    const storage = memoryStorage();
    expect(saveWorkspaceState(storage, state)).toBe(true);
    expect(loadWorkspaceState(storage)).toEqual(state);
  });

  it("reports nothing saved when the key is absent", () => {
    expect(loadWorkspaceState(memoryStorage())).toBeNull();
  });

  it.each([
    ["broken JSON", "{"],
    ["a non-object payload", '"text"'],
    ["a snapshot without state", '{"version":1}'],
  ])("ignores %s instead of throwing", (_label, raw) => {
    expect(
      loadWorkspaceState(memoryStorage({ [STORAGE_KEY]: raw })),
    ).toBeNull();
  });

  it("drops a snapshot written by another format version", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 99, savedAt: 0, state }),
    });
    expect(loadWorkspaceState(storage)).toBeNull();
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
  });

  it("survives a storage that throws on every access", () => {
    const storage = failingStorage();
    expect(loadWorkspaceState(storage)).toBeNull();
    expect(saveWorkspaceState(storage, state)).toBe(false);
    expect(() => clearWorkspaceState(storage)).not.toThrow();
  });

  it("clears the saved workspace", () => {
    const storage = memoryStorage();
    saveWorkspaceState(storage, state);
    clearWorkspaceState(storage);
    expect(loadWorkspaceState(storage)).toBeNull();
  });

  it("recognises only states that actually hold blocks", () => {
    expect(hasBlocks(state)).toBe(true);
    expect(hasBlocks({ blocks: { blocks: [] } })).toBe(false);
    expect(hasBlocks({})).toBe(false);
    expect(hasBlocks(null)).toBe(false);
  });
});
