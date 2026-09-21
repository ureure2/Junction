export type ItemKind = "folder" | "url" | "app" | "terminal" | "command";
export interface LaunchItem {
  id: string;
  name: string;
  kind: ItemKind;
  target: string;
  cwd: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  folder: string;
  note: string;
  items: LaunchItem[];
}
export interface Workspace {
  version: 1;
  projects: Project[];
}
export interface Run {
  id: string;
  itemId: string;
  name: string;
  status: "running" | "succeeded" | "failed" | "stopped";
  pid: number;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
  consoleOpen: boolean;
}
export const emptyWorkspace = (): Workspace => ({ version: 1, projects: [] });
export const newProject = (): Project => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  folder: "",
  note: "",
  items: [],
});
export const newItem = (): LaunchItem => ({
  id: crypto.randomUUID(),
  name: "",
  kind: "folder",
  target: "",
  cwd: "",
});
export const kindLabels: Record<ItemKind, string> = {
  folder: "폴더",
  url: "웹 링크",
  app: "로컬 앱",
  terminal: "터미널 위치",
  command: "터미널 명령어",
};
export function move<T>(items: T[], index: number, offset: number): T[] {
  const next = [...items];
  const to = index + offset;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length)
    return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length ||
    from === to
  )
    return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function matches(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
export function itemMatches(item: LaunchItem, query: string) {
  return matches(
    `${item.name} ${item.target} ${item.cwd} ${kindLabels[item.kind]}`,
    query,
  );
}
export function itemError(item: LaunchItem, project: Project): string | null {
  if (!item.name.trim()) return "이름을 입력해 주세요.";
  if (item.kind === "url") {
    try {
      const url = new URL(item.target);
      if (!["https:", "http:"].includes(url.protocol))
        return "http 또는 https 주소를 입력해 주세요.";
    } catch {
      return "올바른 웹 주소를 입력해 주세요.";
    }
  }
  if (["folder", "app", "command"].includes(item.kind) && !item.target.trim())
    return item.kind === "command"
      ? "명령어를 입력해 주세요."
      : "경로를 선택해 주세요.";
  if (
    ["terminal", "command"].includes(item.kind) &&
    !(item.cwd.trim() || project.folder.trim())
  )
    return "실행 폴더 또는 프로젝트 기본 폴더를 지정해 주세요.";
  return null;
}
