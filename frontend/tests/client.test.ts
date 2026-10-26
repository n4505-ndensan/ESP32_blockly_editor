import { describe, expect, it, vi } from "vitest";
import { ProgramClient } from "../src/program/client";
import type { Program, ProgramState } from "../src/program/types";

const state = (
  revision: number,
  status: ProgramState["state"] = "running",
  bootId = "boot-a",
): ProgramState => ({ bootId, revision, runId: 1, state: status, error: null });
const program: Program = {
  version: 1,
  body: [{ type: "wait", blockId: "w", ms: 0 }],
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
describe("program client", () => {
  it("does not overwrite newer SSE state with a delayed RUN response", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const client = new ProgramClient(fetcher);
    client.observe(state(0, "idle"));
    const running = client.run(program);
    expect(client.pending).toBe(true);
    client.observe(state(3, "completed"));
    resolve(response(state(1, "starting"), 202));
    await running;
    expect(client.state?.state).toBe("completed");
    expect(client.pending).toBe(false);
  });
  it("does not send a duplicate while a request is pending", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const client = new ProgramClient(fetcher);
    client.observe(state(0, "idle"));
    const first = client.run(program);
    await client.run(program);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(response(state(1, "starting"), 202));
    await first;
  });
  it("queries state after an ambiguous failure without resending RUN", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response(state(2)));
    const client = new ProgramClient(fetcher);
    client.observe(state(0, "idle"));
    await client.run(program);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/program/run",
      "/api/program/state",
    ]);
    expect(client.state?.state).toBe("running");
    expect(client.known).toBe(true);
  });
  it("remains unknown when RUN and recovery GET both fail", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("network"));
    const client = new ProgramClient(fetcher);
    client.observe(state(0, "idle"));
    await client.run(program);
    expect(client.known).toBe(false);
    expect(client.error).not.toBeNull();
  });
  it("accepts reboot SSE but rejects a response from before the reboot", async () => {
    let resolve!: (value: Response) => void;
    const client = new ProgramClient(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    client.observe(state(5));
    const refreshing = client.refresh();
    client.observe(state(0, "idle", "boot-b"));
    resolve(response(state(10)));
    await refreshing;
    expect(client.state?.bootId).toBe("boot-b");
    expect(client.state?.state).toBe("idle");
  });
  it("ignores malformed events and preserves validation diagnostics", async () => {
    const client = new ProgramClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response(
            { error: "invalid_program", message: "入力不足", blockId: "bad" },
            422,
          ),
        ),
    );
    client.observe(state(0, "idle"));
    client.observe({ state: "running" });
    await client.run(program);
    expect(client.state?.state).toBe("idle");
    expect(client.error?.blockId).toBe("bad");
  });
  it("sends stop even when the last known program state is idle", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(state(1, "stopping"), 202));
    const client = new ProgramClient(fetcher);
    await client.stop();
    expect(fetcher.mock.calls[0][0]).toBe("/api/program/stop");
    expect(client.state?.state).toBe("stopping");
  });
});
