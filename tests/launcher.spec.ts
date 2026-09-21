import { test, expect } from "@playwright/test";
import { createProject, openMemo } from "./helpers";

test("최소 크기에서도 편집과 메뉴 닫기를 사용할 수 있다", async ({ page }) => {
  await page.goto("/");
  await createProject(page, "작은 창");
  await page.setViewportSize({ width: 360, height: 420 });
  await page.getByLabel("앱 메뉴", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-menu")).not.toHaveAttribute("open", "");
  await page.getByLabel("앱 메뉴", { exact: true }).click();
  await page.getByRole("button", { name: "메모 펼치기", exact: true }).click();
  await expect(page.locator(".app-menu")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "항목 추가", exact: true }).click();
  for (const kind of [
    "폴더",
    "웹 링크",
    "로컬 앱",
    "터미널 위치",
    "터미널 명령어",
  ]) {
    await page.getByRole("button", { name: kind, exact: true }).click();
    const bounds = await page.getByRole("dialog").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        overflow: el.scrollWidth > el.clientWidth,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      };
    });
    expect(bounds.overflow).toBe(false);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(360);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(420);
    await expect(
      page.getByRole("button", { name: "항목 저장" }),
    ).toBeInViewport();
  }
  await page.screenshot({ path: "artifacts/launcher-editor-360.png" });
});

test("메모를 접어도 저장되고 프로젝트 전환 시 기본적으로 숨긴다", async ({
  page,
}) => {
  await page.goto("/");
  await createProject(page, "메모 A");
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveCount(0);
  const height = await page.evaluate(() => innerHeight);
  await openMemo(page);
  await page
    .getByLabel("프로젝트 자유메모")
    .fill("저장 전에 접어도 보존\nnpm run build");
  await page.getByRole("button", { name: "메모 접기", exact: true }).click();
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveCount(0);
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue(
    "저장 전에 접어도 보존\nnpm run build",
  );
  expect(await page.evaluate(() => innerHeight)).toBe(height);
  await createProject(page, "메모 B");
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveCount(0);
  await openMemo(page);
  await page.getByLabel("프로젝트 자유메모").fill("B의 메모");
  await page.getByLabel("프로젝트 선택").selectOption({ label: "메모 A" });
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveCount(0);
  await page.getByRole("button", { name: "모든 변경 사항 저장됨" }).waitFor();
  await page.reload();
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveCount(0);
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue(
    "저장 전에 접어도 보존\nnpm run build",
  );
  await page.screenshot({ path: "artifacts/launcher-note.png" });
});

test("긴 목록은 창 크기를 유지하며 내부에서 스크롤한다", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "junction-preview-v1",
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "p",
            name: "매우 긴 이름을 가진 개인 프로젝트",
            description: "",
            folder: "C:\\Work",
            note: "",
            items: Array.from({ length: 25 }, (_, n) => ({
              id: `i${n}`,
              name: `${n + 1}. 아주 긴 이름의 작업 항목을 안전하게 표시합니다`,
              kind: "folder",
              target: "C:\\Work",
              cwd: "",
            })),
          },
        ],
      }),
    ),
  );
  await page.goto("/");
  await expect(page.locator(".launch-row")).toHaveCount(25);
  for (const size of [
    { width: 420, height: 520 },
    { width: 360, height: 420 },
  ]) {
    await page.setViewportSize(size);
    const bounds = await page.evaluate(() => {
      const list = document.querySelector(".main-content")!;
      const footer = document
        .querySelector(".app-footer")!
        .getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        scrollable: list.scrollHeight > list.clientHeight,
        footer: footer.bottom,
        height: innerHeight,
      };
    });
    expect(bounds.overflow).toBe(false);
    expect(bounds.scrollable).toBe(true);
    expect(bounds.footer).toBeLessThanOrEqual(bounds.height);
    await page.locator(".launch-row").last().scrollIntoViewIfNeeded();
    await page
      .locator(".launch-row")
      .last()
      .getByRole("button", { name: /메뉴$/ })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
  }
});
