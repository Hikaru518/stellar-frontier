import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test("loads the app and completes the Amy emergency flow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.getByRole("button", { name: /通讯台/ }).click();

  await expect(page.getByRole("heading", { name: "通讯台", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "接通" }).click();

  await expect(page.getByRole("heading", { name: "通话页面：Amy 紧急事件" })).toBeVisible();
  await page.getByRole("button", { name: /地图二级菜单/ }).click();

  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await page.getByRole("button", { name: "返回当前通话" }).click();

  await page.getByRole("button", { name: "立刻撤离" }).click();
  await expect(page.getByText("队员成功撤离。")).toBeVisible();
  await expect(page.getByRole("button", { name: "结束通话" }).last()).toBeVisible();
});

test("opens the communication station and shows a crew inventory", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();

  const mikeCard = page.getByText("Mike，特战干员").locator("xpath=ancestor::article[1]");
  await mikeCard.getByRole("button", { name: "查看背包" }).click();

  await expect(page.getByRole("heading", { name: "Mike / 背包" })).toBeVisible();
  await expect(page.getByText("信号弹")).toBeVisible();
  await expect(page.getByText("x2")).toBeVisible();
  await expect(page.getByText("可在失联或救援相关事件中提供定位帮助。")).toBeVisible();
});

test("shows only the crash site and frontier window on a new map", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /卫星雷达/ }).click();

  const grid = page.getByLabel(/雷达可见矩形/);
  await expect(grid).toBeVisible();
  await expect(grid.getByRole("button")).toHaveCount(9);
  await expect(grid.getByRole("button", { name: /坠毁区域/ })).toBeVisible();
  await expect(grid.getByRole("button", { name: /未探索信号/ })).toHaveCount(8);
  await expect(page.getByText(/4x4|4 x 4/)).toHaveCount(0);
  await expect(grid.getByText("坠毁西缘")).toHaveCount(0);
  await expect(grid.getByText("北部玄武高地")).toHaveCount(0);
});

test("moves Garry to a frontier tile and expands the visible map", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  const garryCard = page.getByText("Garry，退休老大爷").locator("xpath=ancestor::article[1]");
  await garryCard.getByRole("button", { name: "通话" }).click();
  await page.getByRole("button", { name: /请求前往/ }).click();

  await page.getByRole("button", { name: /未探索信号（-1,0）/ }).click();
  await page.getByRole("button", { name: /确认请求 Garry 前往 未探索信号（-1,0）/ }).click();
  await expect(page.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeVisible();

  await page.clock.runFor(150_000);
  await expect(page.getByText(/地点：坠毁西缘 \(-1,0\)/)).toBeVisible();

  await page.getByRole("button", { name: /地图二级菜单/ }).click();
  const grid = page.getByLabel(/雷达可见矩形/);
  await expect(grid.getByRole("button", { name: /坠毁西缘/ })).toBeVisible();
  await expect(grid.getByRole("button")).toHaveCount(25);
});

test("opens an investigation report from the log with environment fields", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  const garryCard = page.getByText("Garry，退休老大爷").locator("xpath=ancestor::article[1]");
  await garryCard.getByRole("button", { name: "通话" }).click();
  await page.getByRole("button", { name: /开展调查/ }).click();

  await page.clock.runFor(180_000);
  await page.getByRole("button", { name: "结束通话" }).last().click();
  await page.getByRole("button", { name: /返回/ }).click();

  await page.getByRole("button", { name: "查看报告" }).first().click();
  await expect(page.getByRole("heading", { name: "调查报告" })).toBeVisible();
  await expect(page.getByText("铁脊矿带")).toBeVisible();
  await expect(page.getByText("18 °C")).toBeVisible();
  await expect(page.getByText("32%")).toBeVisible();
  await expect(page.getByText("72 μT")).toBeVisible();
});
