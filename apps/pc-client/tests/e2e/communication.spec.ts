import { expect, mikeCard, startNormalMikeCall, test } from "./support/appTest";

test("opens basic normal-call actions for the current 麦克 baseline", async ({ page }) => {
  await page.goto("/");

  await startNormalMikeCall(page);

  await expect(page.getByRole("heading", { name: "麦克 通话界面" })).toBeVisible();
  await expect(page.getByText("基础行动")).toBeVisible();
  await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移动到指定区域" })).toBeVisible();
  await expect(page.getByRole("button", { name: "原地待命" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "结束通话" })).toBeVisible();
});

test("opens the call map submenu and returns to the active 麦克 call", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await startNormalMikeCall(page);

  await expect(page.getByRole("button", { name: "立刻撤离" })).toHaveCount(0);
  await page.getByRole("button", { name: /地图/ }).click();

  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await page.getByRole("button", { name: "返回当前通话" }).click();
  await expect(page.getByRole("heading", { name: "麦克 通话界面" })).toBeVisible();
});

test("opens the communication station and shows 麦克's empty inventory", async ({ page }) => {
  await page.goto("/");

  await mikeCard(page).getByRole("button", { name: "查看背包" }).click();

  await expect(page.getByRole("heading", { name: "麦克 角色背包" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "麦克 角色档案" })).toHaveCount(0);
  await expect(page.getByText("NO CARRIED ITEMS.")).toBeVisible();
});

test("shows the control center mobile sync status with incoming station state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("COMMUNICATION STATION ......... INCOMING")).toBeVisible();
  const mobileStatus = page.locator(".console-status-card").filter({ hasText: "mobile" });
  await expect(mobileStatus).toContainText(/WAIT|FALLBACK|ACTIVE/);
});
