import {
  CRASH_SITE_FEATURE_IDS,
  answerMikeIncomingCall,
  expect,
  featureSection,
  findSavedCrew,
  GAME_SAVE_KEY,
  idleMike,
  installSave,
  readSave,
  startNormalMikeCall,
  test,
  waitForRuntimeEventStatus,
  createRevealedCrashSiteMap,
} from "./support/appTest";

test.describe.configure({ timeout: 90_000 });

test("surveys the IAFS crash site and reveals the three repair actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await startNormalMikeCall(page);

  await expect(page.getByText(/地点：奥德赛号坠毁点 \/ 116-112/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "雷达装置" })).toHaveCount(0);

  await page.getByRole("button", { name: "调查当前区域" }).click();
  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.clock.runFor(45_000);
  await answerMikeIncomingCall(page);

  await expect(
    page.getByText("这里还有几套能辨认出来的关键设施，雷达装置、维生装置和穿梭机核心都还在，只是现在都散在撞击坑边上。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认标记这些可用设施。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_crash_site_survey_reveal", "resolved");

  const savedAfterSurvey = await readSave(page);
  for (const featureId of CRASH_SITE_FEATURE_IDS) {
    expect(savedAfterSurvey.map.featuresById[featureId]).toEqual(expect.objectContaining({ id: featureId, revealed: true }));
  }

  await page.getByRole("button", { name: /控制台/ }).click();
  await startNormalMikeCall(page);

  await expect(featureSection(page, "雷达装置").getByRole("button", { name: "调查" })).toBeVisible();
  await expect(featureSection(page, "维生装置").getByRole("button", { name: "调查" })).toBeVisible();
  await expect(featureSection(page, "穿梭机核心").getByRole("button", { name: "调查" })).toBeVisible();
  await expect(page.getByRole("button", { name: "维修" })).toHaveCount(3);
});

test("dispatches a revealed radar repair into a timed crew action", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("116-112")],
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await startNormalMikeCall(page);

  await featureSection(page, "雷达装置").getByRole("button", { name: "维修" }).click();

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return Object.values(save.crew_actions ?? {}).some((action) => {
      if (!action || typeof action !== "object") {
        return false;
      }

      const crewAction = action as { type?: string; action_params?: { target_feature_id?: string } };
      return crewAction.type === "repair" && crewAction.action_params?.target_feature_id === "iafs_generator";
    });
  }, GAME_SAVE_KEY);

  const saved = await readSave(page);
  const repairActions = Object.values(saved.crew_actions ?? {}) as Array<{
    type: string;
    action_params?: { target_feature_id?: string };
  }>;
  expect(repairActions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "repair",
        action_params: expect.objectContaining({ target_feature_id: "iafs_generator" }),
      }),
    ]),
  );
  expect(findSavedCrew(saved, "mike")).toMatchObject({ status: "正在维修雷达装置。" });
});

test("opens a damaged crash-site feature inspection runtime call", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("116-112")],
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await startNormalMikeCall(page);

  await featureSection(page, "雷达装置").getByRole("button", { name: "调查" }).click();

  await expect(page.getByText("天线折断，定位回路一直在断续重启。现在强行上线只会让扫描阵列继续烧坏。")).toBeVisible();
  await page.getByRole("button", { name: "确认记录雷达装置状态。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_generator_inspect_damaged", "resolved");
});

test("default survey away from the crash site reports no new clue", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("126-126", { status: "远离坠毁点待命。" })],
  });

  await page.goto("/");
  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "调查当前区域" }).click();
  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.clock.runFor(45_000);
  await answerMikeIncomingCall(page);

  await expect(page.getByText("暂时没有发现值得特别关注的新东西，至少眼下没有。")).toBeVisible();
  await page.getByRole("button", { name: "确认记录，继续保持观察。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_default_survey_nothing_found", "resolved");
});
