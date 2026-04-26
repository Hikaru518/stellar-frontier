import { expect, test } from "@playwright/test";

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
