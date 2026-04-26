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

  await page.getByRole("button", { name: "快跑（资源中断）" }).click();
  await expect(page.getByText("Amy 切断了采集路线并开始撤离。熊没有签署停火协议。")).toBeVisible();
  await expect(page.getByRole("button", { name: "结束通话" }).last()).toBeVisible();
});
