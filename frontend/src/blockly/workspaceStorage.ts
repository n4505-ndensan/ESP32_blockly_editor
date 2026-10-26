// ブラウザのlocalStorageに編集中のブロックを退避する。
// 再読み込みやエラーでページが落ちても、直前の状態から再開できるようにする。
export const STORAGE_KEY = "esp32-blockly-editor:workspace";
const VERSION = 1;

export type WorkspaceState = Record<string, unknown>;
type Snapshot = { version: number; savedAt: number; state: WorkspaceState };

// localStorageは容量超過や無効化で例外を投げる。保存可否を呼び出し側へ返す。
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadWorkspaceState(
  storage: StorageLike,
): WorkspaceState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSnapshot(parsed)) return null;
  // 旧形式は復元せず破棄する。壊れたブロックを読み込むより初期状態の方が安全。
  if (parsed.version !== VERSION) {
    clearWorkspaceState(storage);
    return null;
  }
  return parsed.state;
}

export function saveWorkspaceState(
  storage: StorageLike,
  state: WorkspaceState,
  now = Date.now(),
): boolean {
  const snapshot: Snapshot = { version: VERSION, savedAt: now, state };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceState(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* 保存できない環境では何もしない。 */
  }
}

// 空のワークスペース（開始ブロックのみ、もしくはブロックなし）は保存不要とみなす。
export function hasBlocks(state: WorkspaceState | null | undefined): boolean {
  const blocks = state?.blocks;
  if (!blocks || typeof blocks !== "object") return false;
  const list = (blocks as { blocks?: unknown }).blocks;
  return Array.isArray(list) && list.length > 0;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Snapshot>;
  return (
    typeof candidate.version === "number" &&
    !!candidate.state &&
    typeof candidate.state === "object"
  );
}
