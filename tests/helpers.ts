import { type Page } from "@playwright/test";
export async function menuAction(page: Page, name: string) {
  await page.getByLabel("앱 메뉴", { exact: true }).click();
  await page
    .locator(".app-menu")
    .getByRole("button", { name, exact: true })
    .click();
}
export async function openMemo(page: Page) {
  if (!(await page.getByLabel("프로젝트 자유메모").isVisible()))
    await page
      .getByRole("button", { name: "메모 펼치기", exact: true })
      .click();
}
export async function createProject(
  page: Page,
  name: string,
  folder = "C:\\Projects\\Junction",
) {
  await menuAction(page, "새 프로젝트");
  await page.getByLabel("프로젝트 이름").fill(name);
  await page.getByLabel("기본 작업 폴더").fill(folder);
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
}
export async function addItem(
  page: Page,
  kind: string,
  name: string,
  target?: string,
) {
  await page.getByRole("button", { name: "항목 추가", exact: true }).click();
  await page.getByRole("button", { name: kind, exact: true }).click();
  await page.getByLabel("이름", { exact: true }).fill(name);
  if (target)
    await page
      .getByLabel(
        kind === "웹 링크"
          ? "웹 주소"
          : kind === "터미널 명령어"
            ? "명령어"
            : "경로",
        { exact: true },
      )
      .fill(target);
  await page.getByRole("button", { name: "항목 저장" }).click();
}
