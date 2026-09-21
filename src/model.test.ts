import { describe, it, expect } from "vitest";
import {
  newProject,
  newItem,
  move,
  reorder,
  itemError,
  itemMatches,
} from "./model";
describe("프로젝트 항목", () => {
  it("기본 폴더를 사용하는 명령어를 허용한다", () => {
    const p = newProject();
    p.folder = "C:\\작업 폴더";
    expect(
      itemError(
        { ...newItem(), name: "개발", kind: "command", target: "npm run dev" },
        p,
      ),
    ).toBeNull();
  });
  it("실행 폴더 없는 명령어와 실행 가능한 URL을 거부한다", () => {
    const p = newProject();
    expect(
      itemError(
        { ...newItem(), name: "개발", kind: "command", target: "npm run dev" },
        p,
      ),
    ).toContain("폴더");
    expect(
      itemError(
        {
          ...newItem(),
          name: "링크",
          kind: "url",
          target: "javascript:alert(1)",
        },
        p,
      ),
    ).toContain("https");
  });
  it("순서 변경의 경계를 유지한다", () => {
    expect(move(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(reorder(["a", "b", "c"], -1, 1)).toEqual(["a", "b", "c"]);
  });
  it("명령어와 경로도 대소문자 구분 없이 검색한다", () => {
    expect(
      itemMatches(
        { ...newItem(), target: "D:\\Projects\\Junction" },
        "junction",
      ),
    ).toBe(true);
  });
});
