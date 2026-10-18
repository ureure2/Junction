import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only in a disposable GitHub Windows runner');
const exe = process.env.JUNCTION_INSTALLED_EXE;
assert.ok(exe, 'Installed app path is required');
const evidence = path.resolve('release-verification');
await mkdir(evidence, { recursive: true });
const dataFile = path.join(process.env.APPDATA, 'com.junction.desktop', 'workspace.json');
const projectName = '설치 검증 프로젝트';
const note = '공개 설치 파일 저장 및 재실행 검증';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let app;
let browser;

async function launch() {
  app = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  let launchError;
  app.on('error', error => { launchError = error; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (app.exitCode !== null) throw new Error(`App exited early: ${app.exitCode}`);
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (response.ok) break;
    } catch {}
    await delay(500);
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
  let page;
  await expect.poll(() => {
    page = browser.contexts().flatMap(context => context.pages()).find(candidate => /tauri\.localhost|tauri:\/\//.test(candidate.url()));
    return Boolean(page);
  }, { timeout: 30000 }).toBe(true);
  await expect(page.getByLabel('앱 메뉴', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true, 'Must be actual desktop IPC, not preview');
  return page;
}

async function closeNormally() {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p = Get-Process -Id ${app.pid} -ErrorAction Stop; if (!$p.CloseMainWindow()) { throw 'Could not request normal window close' }`], { windowsHide: true });
  await expect.poll(() => app.exitCode, { timeout: 30000 }).not.toBeNull();
  assert.equal(app.exitCode, 0, 'App should exit cleanly');
  await browser.close();
  browser = undefined;
  app = undefined;
}

try {
  let page = await launch();
  await page.screenshot({ path: path.join(evidence, '01-first-launch.png') });
  await page.getByLabel('앱 메뉴', { exact: true }).click();
  await page.locator('.app-menu').getByRole('button', { name: '새 프로젝트', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill(projectName);
  await page.getByLabel('기본 작업 폴더').fill(process.env.RUNNER_TEMP);
  await page.getByRole('button', { name: '프로젝트 저장', exact: true }).click();
  await expect(page.getByLabel('프로젝트 이름')).toBeHidden();
  await expect(page.getByLabel('프로젝트 선택').locator('option:checked')).toHaveText(projectName);
  await page.getByRole('button', { name: '메모 펼치기', exact: true }).click();
  await page.getByLabel('프로젝트 자유메모').fill(note);
  await page.getByRole('button', { name: '항목 추가', exact: true }).click();
  await page.getByRole('button', { name: '폴더', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('검증 폴더');
  await page.getByLabel('경로', { exact: true }).fill(process.env.RUNNER_TEMP);
  await page.getByRole('button', { name: '항목 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '모든 변경 사항 저장됨', exact: true })).toBeVisible();
  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(saved.projects.length, 1);
  assert.equal(saved.projects[0].name, projectName);
  assert.equal(saved.projects[0].note, note);
  assert.equal(saved.projects[0].items[0].name, '검증 폴더');
  await page.screenshot({ path: path.join(evidence, '02-saved.png') });
  await closeNormally();
  page = await launch();
  await expect(page.getByLabel('프로젝트 선택').locator('option:checked')).toHaveText(projectName);
  await page.getByRole('button', { name: '메모 펼치기', exact: true }).click();
  await expect(page.getByLabel('프로젝트 자유메모')).toHaveValue(note);
  await expect(page.getByRole('button', { name: '검증 폴더 실행', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, '03-reopened.png') });
  await closeNormally();
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ release: 'v0.2.0', actualInstalledApp: true, projectSaved: true, itemSaved: true, noteSaved: true, persistedAcrossRestart: true, normalClose: true }, null, 2));
  await appendFile(process.env.GITHUB_STEP_SUMMARY, '\nActual installed app: launch, project/item/note save, disk persistence, normal close and restart restoration all passed.\n');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app && app.exitCode === null) {
    execFileSync('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true });
  }
}
