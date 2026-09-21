import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("Windows 배포 설정", () => {
  test("NSIS가 현재 사용자 범위로 설치된다", () => {
    const config = json("src-tauri/tauri.conf.json");

    expect(config.identifier).toBe("com.junction.desktop");
    expect(config.bundle.targets).toContain("nsis");
    expect(config.bundle.windows.nsis.installMode).toBe("currentUser");
  });

  test("npm, Tauri, Cargo 버전이 일치한다", () => {
    const packageJson = json("package.json");
    const tauri = json("src-tauri/tauri.conf.json");
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];

    expect(tauri.version).toBe(packageJson.version);
    expect(cargoVersion).toBe(packageJson.version);
  });
});
