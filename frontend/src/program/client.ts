import type { Program, ProgramError, ProgramState } from "~/program/types";
import { isActive } from "~/program/types";

export function isProgramState(value: unknown): value is ProgramState {
  if (!value || typeof value !== "object") return false;
  const s = value as ProgramState;
  return (
    typeof s.bootId === "string" &&
    s.bootId.length > 0 &&
    Number.isInteger(s.revision) &&
    s.revision >= 0 &&
    Number.isInteger(s.runId) &&
    s.runId >= 0 &&
    [
      "idle",
      "starting",
      "running",
      "stopping",
      "completed",
      "stopped",
      "error",
    ].includes(s.state) &&
    (s.error === null ||
      (typeof s.error?.code === "string" &&
        typeof s.error.message === "string")) &&
    (s.waiting == null ||
      (typeof s.waiting.deviceId === "string" &&
        typeof s.waiting.blockId === "string"))
  );
}

/** Pure HTTP/state client: Solid and the editor subscribe through changed(). */
export class ProgramClient {
  state: ProgramState | null = null;
  error: ProgramError | null = null;
  known = false;
  private requests = 0;
  private stopping = false;
  private epoch = 0;
  private runAbort?: AbortController;
  get pending() {
    return this.requests > 0;
  }
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly changed: () => void = () => {},
  ) {}
  private accept(value: unknown, allowBootChange: boolean) {
    if (!isProgramState(value)) return false;
    if (this.state) {
      if (value.bootId !== this.state.bootId && !allowBootChange) return false;
      if (
        value.bootId === this.state.bootId &&
        value.revision < this.state.revision
      )
        return false;
    }
    this.state = value;
    this.known = true;
    return true;
  }
  observe(value: unknown) {
    if (!isProgramState(value)) return;
    ++this.epoch;
    this.accept(value, true);
    this.changed();
  }
  disconnected() {
    ++this.epoch;
    this.known = false;
    this.changed();
  }
  async refresh() {
    const epoch = this.epoch;
    try {
      const response = await this.fetcher("/api/program/state", {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("state");
      const value: unknown = await response.json();
      if (!isProgramState(value)) throw new Error("state");
      this.accept(value, epoch === this.epoch);
      this.changed();
    } catch {
      // A newer SSE event can have resolved the uncertainty while this GET failed.
      if (epoch === this.epoch) this.known = false;
      this.changed();
    }
  }
  private async command(
    url: string,
    body?: Program,
  ): Promise<ProgramState | null> {
    ++this.requests;
    this.error = null;
    this.changed();
    const epoch = this.epoch;
    const abort = new AbortController();
    if (body) this.runAbort = abort;
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: abort.signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        this.error = {
          code:
            typeof payload?.error === "string"
              ? payload.error
              : "request_failed",
          message:
            payload?.message ?? `操作できませんでした (${response.status})`,
          blockId: payload?.blockId,
        };
        if (response.status === 409) await this.refresh();
        return null;
      }
      if (!isProgramState(payload)) throw new Error("invalid response");
      this.accept(payload, epoch === this.epoch);
      return payload;
    } catch {
      if (epoch === this.epoch) this.known = false;
      this.error = {
        code: "connection_error",
        message: "送信結果が不明です。実行状態を確認しています。",
      };
      await this.refresh();
      if (this.known)
        this.error = {
          code: "connection_error",
          message:
            "送信の応答を受け取れませんでした。実機から取得した現在の状態を表示しています。",
        };
      else
        this.error = {
          code: "connection_error",
          message:
            "実行状態を確認できません。接続を確認してください。停止は再度送信できます。",
        };
      return null;
    } finally {
      clearTimeout(timer);
      if (this.runAbort === abort) this.runAbort = undefined;
      --this.requests;
      this.changed();
    }
  }
  run(program: Program) {
    if (this.pending || !this.known || isActive(this.state?.state))
      return Promise.resolve(null);
    return this.command("/api/program/run", program);
  }
  async stop() {
    if (this.stopping) return null;
    this.stopping = true;
    this.runAbort?.abort();
    try {
      return await this.command("/api/program/stop");
    } finally {
      this.stopping = false;
    }
  }
}
