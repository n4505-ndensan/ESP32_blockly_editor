import { expect, test } from "@playwright/test";

test("renders the editor and validates an empty start", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".blockly-editor .blocklySvg").first()).toBeVisible();
  await page.getByRole("button", { name: "ブロックを確認" }).click();
  await expect(page.getByRole("alert")).toContainText("開始ブロックに処理を接続");
  expect(errors).toEqual([]);
});

test("manual control, runtime SSE, and STOP operate the same board", async ({ page, request }) => {
  test.skip(!process.env.VITE_ESP32_TARGET, "Set VITE_ESP32_TARGET to run the hardware browser test.");
  await request.post("/api/program/stop");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "実行 / RUN" })).toBeEnabled({ timeout: 15000 });
  const red = page.getByRole("switch", { name: /赤色LED/ });
  await red.click(); await expect(red).toHaveAttribute("aria-checked", "true");
  const result = await request.post("/api/program/run", { data: { version: 1, body: [{ type: "forever", blockId: "loop", body: [] }] } });
  expect(result.status()).toBe(202);
  await expect(page.locator(".program-status")).toHaveText("実行中");
  await expect(red).toBeDisabled();
  // The running program has all outputs OFF: this button must still be available.
  await expect(page.getByRole("button", { name: "すべて消す" })).toBeEnabled();
  await page.getByRole("button", { name: "停止 / STOP" }).click();
  await expect(page.locator(".program-status")).toHaveText("停止済み");
  await expect(red).toBeEnabled(); await expect(red).toHaveAttribute("aria-checked", "false");
});
