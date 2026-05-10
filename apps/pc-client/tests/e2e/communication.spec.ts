import { expect, mikeCard, startNormalMikeCall, test } from "./support/appTest";

test("opens basic normal-call actions for the current Mike baseline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();

  await startNormalMikeCall(page);

  await expect(page.getByRole("heading", { name: "通话页面：Mike 状态确认" })).toBeVisible();
  await expect(page.getByText("基础行动")).toBeVisible();
  await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移动到指定区域" })).toBeVisible();
  await expect(page.getByRole("button", { name: "原地待命" })).toBeVisible();
});

test("opens the call map submenu and returns to the active Mike call", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);

  await expect(page.getByRole("button", { name: "立刻撤离" })).toHaveCount(0);
  await page.getByRole("button", { name: /地图二级菜单/ }).click();

  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await page.getByRole("button", { name: "返回当前通话" }).click();
  await expect(page.getByRole("heading", { name: "通话页面：Mike 状态确认" })).toBeVisible();
});

test("opens the communication station and shows Mike's empty inventory", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  await mikeCard(page).getByRole("button", { name: "查看背包" }).click();

  await expect(page.getByRole("heading", { name: "Mike / 背包" })).toBeVisible();
  await expect(page.getByText("未记录携带物。")).toBeVisible();
});

test("shows the Yuan realtime link with WebRTC as LAN upgrade and WSS fallback", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();

  const phonePanel = page.getByText("手机私人终端").locator("xpath=ancestor::section[1]");
  await expect(phonePanel).toBeVisible();
  await expect(phonePanel.getByLabel("实时连接说明")).toBeVisible();
  await expect(phonePanel.getByText("局域网升级")).toBeVisible();
  await expect(phonePanel.getByText(/yuan-webrtc-datachannel/)).toBeVisible();
  await expect(phonePanel.getByText("公网兜底")).toBeVisible();
  await expect(phonePanel.getByText(/yuan-wss \/ 同区域/)).toBeVisible();
  await expect(phonePanel.getByText("enableWebRTC=true", { exact: true })).toBeVisible();
});
