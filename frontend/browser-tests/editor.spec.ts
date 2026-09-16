import { expect, test } from "@playwright/test";

test.afterEach(async ({ request }) => {
  if (process.env.VITE_ESP32_TARGET) {
    const response = await request.post("/api/program/stop");
    expect(response.status()).toBe(202);
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/program/state")).json()).state,
      )
      .toBe("stopped");
  }
});

test("renders the editor and validates an empty start", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.locator(".blockly-editor .blocklySvg").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "ブロックを確認" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "開始ブロックに処理を接続",
  );
  expect(errors).toEqual([]);
});

test("manual control, runtime SSE, and STOP operate the same board", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.VITE_ESP32_TARGET,
    "Set VITE_ESP32_TARGET to run the hardware browser test.",
  );
  await request.post("/api/program/stop");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "実行 / RUN" })).toBeEnabled({
    timeout: 15000,
  });
  const red = page.getByRole("switch", { name: /赤色LED/ });
  await red.click();
  await expect(red).toHaveAttribute("aria-checked", "true");
  const result = await request.post("/api/program/run", {
    data: {
      version: 1,
      body: [{ type: "forever", blockId: "loop", body: [] }],
    },
  });
  expect(result.status()).toBe(202);
  await expect(page.locator(".program-status")).toHaveText("実行中");
  await expect(red).toBeDisabled();
  // The running program has all outputs OFF: this button must still be available.
  await expect(page.getByRole("button", { name: "すべて消す" })).toBeEnabled();
  await page.getByRole("button", { name: "停止 / STOP" }).click();
  await expect(page.locator(".program-status")).toHaveText("停止済み");
  await expect(red).toBeEnabled();
  await expect(red).toHaveAttribute("aria-checked", "false");
});

test("Blockly RUN compiles a one-second LED sequence", async ({ page }) => {
  test.skip(!process.env.VITE_ESP32_TARGET, "Hardware required");
  await page.goto("/");
  const run = page.getByRole("button", { name: "実行 / RUN" });
  await expect(run).toBeEnabled();
  await page.evaluate(async () => {
    const path = "/browser-tests/workspace.ts";
    (await import(/* @vite-ignore */ path)).loadScenario("blink");
  });
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/program/run") && r.method() === "POST",
  );
  await run.click();
  expect((await sent).postDataJSON()).toMatchObject({
    version: 1,
    body: [
      { type: "set_output", on: true },
      { type: "wait", ms: 1000 },
      { type: "set_output", on: false },
    ],
  });
  const red = page.getByRole("switch", { name: /赤色LED/ });
  await expect(red).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".program-status")).toHaveText("実行完了");
  await expect(red).toHaveAttribute("aria-checked", "false");
});

test("editing is deferred and reloading can stop a running Blockly program", async ({
  page,
}) => {
  test.skip(!process.env.VITE_ESP32_TARGET, "Hardware required");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "実行 / RUN" })).toBeEnabled();
  await page.evaluate(async () => {
    const path = "/browser-tests/workspace.ts";
    (await import(/* @vite-ignore */ path)).loadScenario("forever");
  });
  await page.getByRole("button", { name: "実行 / RUN" }).click();
  await expect(page.locator(".program-status")).toHaveText("実行中");
  await page.evaluate(async () => {
    const path = "/browser-tests/workspace.ts";
    (await import(/* @vite-ignore */ path)).editOutput();
  });
  await expect(page.getByRole("switch", { name: /赤色LED/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "停止 / STOP" }).click();
  await expect(page.locator(".program-status")).toHaveText("停止済み");
  await page.getByRole("button", { name: "実行 / RUN" }).click();
  await expect(page.locator(".program-status")).toHaveText("実行中");
  await expect(page.getByRole("switch", { name: /赤色LED/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.reload();
  await expect(page.locator(".program-status")).toHaveText("実行中");
  await page.getByRole("button", { name: "すべて消す" }).click();
  await expect(page.locator(".program-status")).toHaveText("停止済み");
  await expect(page.getByRole("switch", { name: /赤色LED/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("runtime error highlights the submitted block only until edited", async ({
  page,
}) => {
  test.skip(!process.env.VITE_ESP32_TARGET, "Hardware required");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "実行 / RUN" })).toBeEnabled();
  await page.evaluate(async () => {
    const path = "/browser-tests/workspace.ts";
    (await import(/* @vite-ignore */ path)).loadScenario("error");
  });
  await page.getByRole("button", { name: "実行 / RUN" }).click();
  await expect(page.locator(".program-status")).toHaveText("実行エラー");
  await expect(page.getByRole("alert")).toContainText("0で割る");
  await expect(page.locator(".blocklyHighlighted")).toHaveCount(1);
  await page.evaluate(async () => {
    const path = "/browser-tests/workspace.ts";
    (await import(/* @vite-ignore */ path)).editError();
  });
  await expect(page.locator(".blocklyHighlighted")).toHaveCount(0);
});

test("LittleFS serves the actual board UI and synchronizes both snapshots", async ({
  page,
}) => {
  test.skip(!process.env.VITE_ESP32_TARGET, "Hardware required");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.VITE_ESP32_TARGET!);
  await expect(
    page.locator(".blockly-editor .blocklySvg").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "実行 / RUN" })).toBeEnabled({
    timeout: 15000,
  });
  expect(errors).toEqual([]);
});
