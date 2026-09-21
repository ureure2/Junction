import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  emptyWorkspace,
  type Workspace,
  type LaunchItem,
  type Run,
} from "./model";

export const desktop = isTauri();
const previewKey = "junction-preview-v1";
export const api = {
  load: async (): Promise<{ workspace: Workspace; warning: string | null }> =>
    desktop
      ? invoke("load_workspace")
      : {
          workspace: JSON.parse(
            localStorage.getItem(previewKey) ||
              JSON.stringify(emptyWorkspace()),
          ),
          warning: null,
        },
  save: async (workspace: Workspace): Promise<void> => {
    if (desktop) await invoke("save_workspace", { workspace });
    else localStorage.setItem(previewKey, JSON.stringify(workspace));
  },
  launch: async (item: LaunchItem, folder: string): Promise<Run | null> => {
    if (!desktop)
      throw new Error("실행은 Junction 데스크탑 앱에서 사용할 수 있어요.");
    return invoke("launch_item", { item, folder });
  },
  runs: async (): Promise<Run[]> => (desktop ? invoke("list_runs") : []),
  stop: async (id: string): Promise<void> => invoke("stop_run", { id }),
  environment: async (): Promise<{ shell: string; dataDir: string }> =>
    desktop
      ? invoke("environment")
      : { shell: "PowerShell", dataDir: "브라우저 미리보기 저장소" },
  pick: async (directory: boolean): Promise<string | null> => {
    if (!desktop) throw new Error("미리보기에서는 경로를 직접 입력해 주세요.");
    const result = await open({
      directory,
      multiple: false,
      filters: directory
        ? undefined
        : [{ name: "실행 파일 또는 바로가기", extensions: ["exe", "lnk"] }],
    });
    return typeof result === "string" ? result : null;
  },
  import: async (): Promise<Workspace | null> => {
    if (!desktop)
      throw new Error("파일 가져오기는 데스크탑 앱에서 사용할 수 있어요.");
    const path = await open({
      multiple: false,
      filters: [{ name: "Junction 데이터", extensions: ["json"] }],
    });
    return typeof path === "string" ? invoke("read_import", { path }) : null;
  },
  export: async (workspace: Workspace): Promise<boolean> => {
    if (!desktop)
      throw new Error("파일 내보내기는 데스크탑 앱에서 사용할 수 있어요.");
    const path = await save({
      defaultPath: `Junction-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "Junction 데이터", extensions: ["json"] }],
    });
    if (!path) return false;
    await invoke("export_workspace", { path, workspace });
    return true;
  },
  quit: async (): Promise<void> => invoke("quit_app"),
};
