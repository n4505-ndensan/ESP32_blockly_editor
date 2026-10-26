import { expect, test } from "@playwright/test";
import { STORAGE_KEY } from "../src/blockly/workspaceStorage";
import { dummyCatalog } from "../src/device/dummyCatalog";

test("reload preserves device IDs while the catalog is delayed", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_ESP32_TARGET,
    "Set VITE_ESP32_TARGET to enable SSE mode; board responses are mocked.",
  );
  const devices = dummyCatalog();
  const outputs = devices.filter((device) => device.kind === "output");
  const fields = devices.map((device) => ({
    type: device.kind === "output" ? "device_set" : "device_sensor",
    id: `saved_${device.id}`,
    fields: { DEVICE: device.id },
  }));
  await page.addInitScript(
    ({ key, blocks }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            savedAt: 0,
            state: { blocks: { languageVersion: 0, blocks } },
          }),
        );
    },
    { key: STORAGE_KEY, blocks: fields },
  );
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Cannot set the dropdown's value"))
      warnings.push(message.text());
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseCatalog!: () => void;
  const delayCatalog = () =>
    new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
  let catalogReady = delayCatalog();
  await page.route("**/api/devices", async (route) => {
    await catalogReady;
    await route.fulfill({
      json: { devices, bootId: "restore-test", revision: 0 },
    });
  });
  await page.route("**/events", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body:
        `event: devices\ndata: ${JSON.stringify({ bootId: "restore-test", revision: 0, devices: [] })}\n\n` +
        `event: program\ndata: ${JSON.stringify({ bootId: "restore-test", revision: 0, runId: 0, state: "idle", error: null })}\n\n`,
    }),
  );

  const readFields = (flyout = false) =>
    page.evaluate(async (flyout) => {
      const path = "/browser-tests/workspace.ts";
      return (await import(/* @vite-ignore */ path)).deviceFields(flyout);
    }, flyout);
  const expectedIds = devices.map((device) => device.id).sort();
  await page.goto("/");
  for (let pass = 0; pass < 2; ++pass) {
    if (pass) {
      catalogReady = delayCatalog();
      await page.reload();
    }
    await expect
      .poll(async () => (await readFields()).map((field) => field.value).sort())
      .toEqual(expectedIds);
    expect(
      (await readFields()).every((field) => field.text.includes("未接続")),
    ).toBe(true);
    releaseCatalog();
    await expect(page.getByRole("switch")).toHaveCount(outputs.length);
    await expect
      .poll(async () =>
        (await readFields()).some((field) => field.text.includes("未接続")),
      )
      .toBe(false);
    await page.getByRole("treeitem", { name: "出力", exact: true }).click();
    await expect
      .poll(async () =>
        (await readFields(true)).map((field) => field.value).sort(),
      )
      .toEqual(outputs.map((device) => device.id).sort());
    expect(
      (await readFields(true)).some((field) => field.text.includes("部品なし")),
    ).toBe(false);
  }
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});
