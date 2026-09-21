import { test, expect } from "@playwright/test";
import { createProject, addItem, menuAction, openMemo } from "./helpers";

test("작은 창에서 다섯 종류 항목과 메모 저장·복원·검색", async ({ page }) => {
  await page.goto("/");
  await createProject(page, "Junction 개발");
  await addItem(page, "폴더", "소스 폴더", "C:\\Projects\\Junction");
  await addItem(page, "웹 링크", "GitHub 저장소", "https://github.com");
  await addItem(page, "로컬 앱", "편집기", "C:\\Apps\\Editor.exe");
  await addItem(page, "터미널 위치", "작업 터미널");
  await addItem(page, "터미널 명령어", "개발 서버", "npm run dev");
  await openMemo(page);
  await page
    .getByLabel("프로젝트 자유메모")
    .fill("다음 할 일\n빌드 확인\nnpm run build");
  await expect(
    page.getByRole("button", { name: "모든 변경 사항 저장됨" }),
  ).toBeVisible();
  await page.reload();
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue(
    "다음 할 일\n빌드 확인\nnpm run build",
  );
  await expect(page.locator(".launch-row")).toHaveCount(5);
  await page.getByLabel("프로젝트 및 항목 검색").fill("github");
  await expect(page.locator(".launch-row")).toHaveCount(1);
  await page.getByRole("button", { name: "검색 지우기" }).click();
  await page.getByLabel("항목 종류 필터").selectOption("command");
  await expect(page.locator(".launch-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "개발 서버 실행", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("데스크탑 앱");
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await page.getByLabel("항목 종류 필터").selectOption("all");
  await page.getByRole("button", { name: "메모 접기", exact: true }).click();
  await page.screenshot({ path: "artifacts/launcher-420.png" });
  await page.setViewportSize({ width: 360, height: 420 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/launcher-360.png" });
});

test("메뉴에서 프로젝트·항목의 순서 변경과 삭제", async ({ page }) => {
  await page.goto("/");
  await createProject(page, "첫 프로젝트");
  await createProject(page, "두 번째");
  await menuAction(page, "프로젝트 위로");
  await expect(
    page.getByLabel("프로젝트 선택").locator("option").first(),
  ).toHaveText("두 번째");
  await page.getByRole("button", { name: "항목 추가", exact: true }).click();
  await page.getByRole("button", { name: "웹 링크", exact: true }).click();
  await page.getByLabel("이름", { exact: true }).fill("잘못된 링크");
  await page.getByLabel("웹 주소").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "항목 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("https");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await addItem(page, "폴더", "A 폴더", "C:\\A");
  await addItem(page, "폴더", "B 폴더", "C:\\B");
  await page.getByRole("button", { name: "B 폴더 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "위로 이동", exact: true }).click();
  await expect(page.locator(".launch-row").first()).toContainText("B 폴더");
  await page.getByRole("button", { name: "B 폴더 메뉴", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.locator(".launch-row")).toHaveCount(1);
  await menuAction(page, "프로젝트 편집");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(
    page.getByLabel("프로젝트 선택").locator("option:checked"),
  ).toHaveText("첫 프로젝트");
});

test("드래그 핸들로 항목 순서를 변경하고 저장한다", async ({ page }) => {
  await page.goto("/");
  await createProject(page, "드래그 프로젝트");
  await addItem(page, "폴더", "첫 항목", "C:\\First");
  await addItem(page, "폴더", "둘째 항목", "C:\\Second");
  await addItem(page, "폴더", "셋째 항목", "C:\\Third");

  const source = page.getByRole("button", { name: "첫 항목 순서 변경" });
  const target = page.getByRole("button", { name: "셋째 항목 순서 변경" });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(page.locator(".item-title")).toHaveText([
    "둘째 항목",
    "셋째 항목",
    "첫 항목",
  ]);
  await page.getByRole("button", { name: "모든 변경 사항 저장됨" }).waitFor();
  await page.reload();
  await expect(page.locator(".item-title")).toHaveText([
    "둘째 항목",
    "셋째 항목",
    "첫 항목",
  ]);

  await page.getByLabel("프로젝트 및 항목 검색").fill("항목");
  await expect(
    page.getByRole("button", { name: "둘째 항목 순서 변경" }),
  ).toBeDisabled();
});

test("프로젝트 전환 후 메모 분리와 기본 폴더 반영", async ({ page }) => {
  await page.goto("/");
  await createProject(page, "메모 A");
  await openMemo(page);
  await page.getByLabel("프로젝트 자유메모").fill("A에만 있는 메모");
  await addItem(page, "터미널 명령어", "빌드", "npm run build");
  await createProject(page, "메모 B");
  await openMemo(page);
  await page.getByLabel("프로젝트 자유메모").fill("B 메모");
  await page.getByLabel("프로젝트 선택").selectOption({ label: "메모 A" });
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue(
    "A에만 있는 메모",
  );
  await menuAction(page, "프로젝트 편집");
  await page.getByLabel("기본 작업 폴더").fill("D:\\Changed");
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
  await page.getByRole("button", { name: "빌드 메뉴", exact: true }).click();
  await expect(page.locator(".item-cwd")).toHaveText("D:\\Changed");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await menuAction(page, "프로젝트 편집");
  await page.getByLabel("기본 작업 폴더").fill("");
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("폴더");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "모든 변경 사항 저장됨" }).waitFor();
  await page.reload();
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue(
    "A에만 있는 메모",
  );
});
