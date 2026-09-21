import { test, expect } from "@playwright/test";
import { menuAction, openMemo, createProject, addItem } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mock = {
      workspace: {
        version: 1,
        projects: [
          {
            id: "p",
            name: "연결 검증",
            description: "",
            folder: "C:\\Work",
            note: "",
            items: [],
          },
        ],
      },
      runs: [] as any[],
      calls: [] as any[],
      launchError: "",
      importError: "",
    };
    Object.assign(window, {
      isTauri: true,
      __junctionMock: mock,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => 1,
        invoke: async (cmd: string, args: any = {}) => {
          mock.calls.push({ cmd, args: structuredClone(args) });
          switch (cmd) {
            case "load_workspace":
              return {
                workspace: structuredClone(mock.workspace),
                warning: null,
              };
            case "save_workspace":
              mock.workspace = structuredClone(args.workspace);
              return;
            case "environment":
              return { shell: "pwsh", dataDir: "C:\\Junction-test" };
            case "list_runs":
              return structuredClone(mock.runs);
            case "launch_item":
              if (mock.launchError) throw mock.launchError;
              const run = {
                id: crypto.randomUUID(),
                itemId: args.item.id,
                name: args.item.name,
                status: "running",
                pid: 1234,
                exitCode: null,
                startedAt: Date.now(),
                endedAt: null,
                consoleOpen: true,
              };
              mock.runs.unshift(run);
              return structuredClone(run);
            case "stop_run": {
              const run = mock.runs.find((r) => r.id === args.id);
              if (!run) throw "Unknown run";
              run.status = "stopped";
              run.consoleOpen = false;
              return;
            }
            case "plugin:dialog|open":
              return args.options.directory
                ? "D:\\Picked Folder"
                : "C:\\import.json";
            case "plugin:dialog|save":
              return "C:\\export.json";
            case "read_import":
              if (mock.importError) throw mock.importError;
              return {
                version: 1,
                projects: [
                  {
                    id: "imported",
                    name: "가져온 프로젝트",
                    description: "",
                    folder: "",
                    note: "복원 메모",
                    items: [],
                  },
                ],
              };
            case "export_workspace":
              return;
            default:
              return 1;
          }
        },
      },
    });
  });
  await page.goto("/");
});

test("다른 프로젝트를 검색해 실행하면 해당 작업 폴더와 종료 대상을 사용한다", async ({
  page,
}) => {
  await createProject(page, "다른 프로젝트", "D:\\Other");
  await addItem(page, "터미널 명령어", "다른 서버", "npm run dev");
  await page.getByLabel("프로젝트 선택").selectOption({ label: "연결 검증" });
  await page.getByLabel("프로젝트 및 항목 검색").fill("다른 서버");
  await page
    .getByRole("button", { name: "다른 서버 실행", exact: true })
    .click();
  await expect(
    page.locator(".launch-row").getByText("실행 중", { exact: true }),
  ).toBeVisible();
  const folder = await page.evaluate(
    () =>
      (window as any).__junctionMock.calls.find(
        (c: any) => c.cmd === "launch_item",
      ).args.folder,
  );
  expect(folder).toBe("D:\\Other");
  await page
    .getByRole("button", { name: "다른 서버 종료", exact: true })
    .click();
  await expect(
    page.locator(".launch-row").getByText("실행 중", { exact: true }),
  ).toHaveCount(0);
});

test("저장하지 않은 테스트 실행을 전체 실행 관리에서 종료한다", async ({
  page,
}) => {
  await page.getByRole("button", { name: "항목 추가", exact: true }).click();
  await page
    .getByRole("button", { name: "터미널 명령어", exact: true })
    .click();
  await page.getByLabel("이름", { exact: true }).fill("저장 전 실행");
  await page.getByLabel("명령어", { exact: true }).fill("npm run dev");
  await page.getByRole("button", { name: "실행해 보기" }).click();
  await expect(
    page.getByText("테스트 실행: 실행 중", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await menuAction(page, "실행 관리");
  await expect(
    page.getByRole("dialog").getByText("저장 전 실행"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "종료", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("종료됨", { exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__junctionMock.calls);
  expect(calls.find((c: any) => c.cmd === "launch_item").args.folder).toBe(
    "C:\\Work",
  );
  expect(calls.filter((c: any) => c.cmd === "stop_run")).toHaveLength(1);
});

test("실행 실패를 설정 창 안에서 표시하고 폴더 선택 결과를 반영한다", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).__junctionMock.launchError =
      "실행 폴더를 찾을 수 없습니다.";
  });
  await page.getByRole("button", { name: "항목 추가", exact: true }).click();
  await page
    .getByRole("button", { name: "터미널 명령어", exact: true })
    .click();
  await page.getByLabel("이름", { exact: true }).fill("실패 확인");
  await page.getByLabel("명령어", { exact: true }).fill("npm run dev");
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.getByLabel("실행 폴더", { exact: true })).toHaveValue(
    "D:\\Picked Folder",
  );
  await page.getByRole("button", { name: "실행해 보기" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "실행 폴더를 찾을 수 없습니다.",
  );
});

test("내보내기와 확인 후 가져오기, 잘못된 데이터 보존을 처리한다", async ({
  page,
}) => {
  await openMemo(page);
  await page.getByLabel("프로젝트 자유메모").fill("내보낼 최신 메모");
  await menuAction(page, "데이터 및 앱 정보");
  await page.getByRole("button", { name: "JSON 내보내기" }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as any).__junctionMock.calls.find(
            (c: any) => c.cmd === "export_workspace",
          )?.args.workspace.projects[0].note,
      ),
    )
    .toBe("내보낼 최신 메모");
  await page.evaluate(() => {
    (window as any).__junctionMock.importError =
      "지원하지 않는 데이터 버전입니다.";
  });
  await page.getByRole("button", { name: "JSON 가져오기" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "지원하지 않는",
  );
  await page.evaluate(() => {
    (window as any).__junctionMock.importError = "";
  });
  await page.getByRole("button", { name: "JSON 가져오기" }).click();
  await page
    .getByRole("dialog", { name: "데이터를 가져올까요?" })
    .getByRole("button", { name: "가져오기", exact: true })
    .click();
  await expect(page.getByLabel("프로젝트 선택")).toBeVisible();
  await openMemo(page);
  await expect(page.getByLabel("프로젝트 자유메모")).toHaveValue("복원 메모");
  expect(
    await page.evaluate(() =>
      (window as any).__junctionMock.calls.filter(
        (c: any) => c.cmd === "launch_item",
      ),
    ),
  ).toHaveLength(0);
});
