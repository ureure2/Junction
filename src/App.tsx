import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  Download,
  Ellipsis,
  Folder,
  FolderOpen,
  GitFork,
  Globe,
  GripVertical,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap,
  AppWindow,
  LoaderCircle,
} from "lucide-react";
import { api, desktop } from "./api";
import {
  emptyWorkspace,
  itemError,
  itemMatches,
  kindLabels,
  matches,
  move,
  reorder,
  newItem,
  newProject,
  type ItemKind,
  type LaunchItem,
  type Project,
  type Run,
  type Workspace,
} from "./model";
import { Persistence, type SaveStatus } from "./persistence";
import "./styles.css";

const icons = {
  folder: Folder,
  url: Globe,
  app: AppWindow,
  terminal: Terminal,
  command: Zap,
};
const statuses = {
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
  stopped: "종료됨",
};
type Confirm = {
  title: string;
  text: string;
  action: () => Promise<void> | void;
  label?: string;
};
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function IconButton({
  title,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={title}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      aria-label={title}
      className={wide ? "modal wide" : "modal"}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton title="닫기" onClick={close}>
          <X size={19} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "command" | "resource">("all");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const [projectDraft, setProjectDraft] = useState<Project | null>(null);
  const [itemDraft, setItemDraft] = useState<LaunchItem | null>(null);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [settings, setSettings] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draggingItem, setDraggingItem] = useState("");
  const [dragTarget, setDragTarget] = useState("");
  const draggingItemRef = useRef("");
  const dragTargetRef = useRef("");
  useEffect(() => {
    setNotesOpen(false);
  }, [selected]);
  const [itemMenu, setItemMenu] = useState<{
    item: LaunchItem;
    owner: Project;
  } | null>(null);
  const [env, setEnv] = useState({ shell: "PowerShell", dataDir: "" });
  const current = useRef(workspace);
  current.current = workspace;
  const runRef = useRef(runs);
  runRef.current = runs;
  const closing = useRef(false);
  const appMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (appMenu.current && !appMenu.current.contains(event.target as Node))
        appMenu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && appMenu.current?.open) {
        appMenu.current.open = false;
        appMenu.current.querySelector("summary")?.focus();
        event.preventDefault();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [persistence] = useState(
    () => new Persistence<Workspace>(api.save, setSaveStatus),
  );
  const project = workspace.projects.find((p) => p.id === selected);
  const activeCount = runs.filter((r) => r.status === "running").length;
  function notify(text: string, error = false) {
    setToast({ text, error });
  }
  async function attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      if (itemDraft || projectDraft) setFormError(errorText(error));
      notify(errorText(error), true);
    }
  }
  function change(next: Workspace) {
    current.current = next;
    setWorkspace(next);
    persistence.schedule(next);
  }
  function updateProject(next: Project) {
    change({
      ...current.current,
      projects: current.current.projects.map((p) =>
        p.id === next.id ? next : p,
      ),
    });
  }
  function startItemDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingItemRef.current = itemId;
    dragTargetRef.current = itemId;
    setDraggingItem(itemId);
    setDragTarget(itemId);
  }
  function moveItemDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingItemRef.current) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-item-id]");
    const target = row?.dataset.itemId || "";
    if (target && target !== dragTargetRef.current) {
      dragTargetRef.current = target;
      setDragTarget(target);
    }
  }
  function finishItemDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    ownerId: string,
  ) {
    if (!draggingItemRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const source = draggingItemRef.current;
    const target = dragTargetRef.current;
    draggingItemRef.current = "";
    dragTargetRef.current = "";
    setDraggingItem("");
    setDragTarget("");
    const owner = current.current.projects.find((p) => p.id === ownerId);
    if (!owner) return;
    const from = owner.items.findIndex((item) => item.id === source);
    const to = owner.items.findIndex((item) => item.id === target);
    if (from !== to)
      updateProject({ ...owner, items: reorder(owner.items, from, to) });
  }
  async function refreshRuns() {
    setRuns(await api.runs());
  }
  useEffect(() => {
    void api
      .load()
      .then(({ workspace: data, warning }) => {
        setWorkspace(data);
        current.current = data;
        setSelected(data.projects[0]?.id || "");
        setLoaded(true);
        if (warning) notify(warning, true);
      })
      .catch((error) => setLoadError(errorText(error)));
    void api
      .environment()
      .then(setEnv)
      .catch((error) => notify(errorText(error), true));
  }, []);
  useEffect(() => {
    let active = true;
    let reported = false;
    async function poll() {
      try {
        const next = await api.runs();
        if (active) {
          setRuns(next);
          reported = false;
        }
      } catch (error) {
        if (active && !reported) {
          notify(errorText(error), true);
          reported = true;
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 900);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    async function close() {
      await persistence.flush();
      closing.current = true;
      try {
        await api.quit();
      } catch (error) {
        closing.current = false;
        throw error;
      }
    }
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (closing.current) return;
        event.preventDefault();
        if (runRef.current.some((r) => r.consoleOpen))
          setConfirm({
            title: "Junction을 종료할까요?",
            text: "Junction이 실행한 명령과 열린 명령 터미널도 함께 종료됩니다. 메모와 변경 사항은 저장됩니다.",
            label: "앱 종료",
            action: close,
          });
        else
          void close().catch((error) =>
            notify(`저장 후 종료할 수 없습니다: ${errorText(error)}`, true),
          );
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [persistence]);
  useEffect(() => {
    if (desktop) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (saveStatus !== "saved") {
        void persistence.flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [saveStatus, persistence]);
  async function launch(item: LaunchItem, owner = project) {
    if (!owner || busy.includes(item.id)) return;
    const error = itemError(item, owner);
    if (error) {
      setFormError(error);
      notify(error, true);
      return;
    }
    setBusy((prev) => [...prev, item.id]);
    try {
      await api.launch(item, owner.folder);
      await refreshRuns();
      notify(
        item.kind === "command"
          ? `${item.name} 실행을 시작했어요.`
          : `${item.name} 열기 요청을 보냈어요.`,
      );
    } catch (error) {
      if (itemDraft) setFormError(errorText(error));
      notify(errorText(error), true);
    } finally {
      setBusy((prev) => prev.filter((id) => id !== item.id));
    }
  }
  async function pick(directory: boolean, setValue: (path: string) => void) {
    await attempt(async () => {
      const path = await api.pick(directory);
      if (path) setValue(path);
    });
  }
  function openProject(value = newProject()) {
    setFormError("");
    setProjectDraft(structuredClone(value));
  }
  function openItem(value = newItem()) {
    setFormError("");
    setItemDraft(structuredClone(value));
  }
  function saveProject(event: React.FormEvent) {
    event.preventDefault();
    if (!projectDraft) return;
    if (!projectDraft.name.trim()) {
      setFormError("프로젝트 이름을 입력해 주세요.");
      return;
    }
    const next = {
      ...projectDraft,
      name: projectDraft.name.trim(),
      folder: projectDraft.folder.trim(),
    };
    for (const item of next.items) {
      const error = itemError(item, next);
      if (error) {
        setFormError(`${item.name}: ${error}`);
        return;
      }
    }
    if (current.current.projects.some((p) => p.id === next.id))
      updateProject(next);
    else
      change({
        ...current.current,
        projects: [...current.current.projects, next],
      });
    setSelected(next.id);
    setProjectDraft(null);
    setQuery("");
  }
  function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!itemDraft || !project) return;
    const error = itemError(itemDraft, project);
    if (error) {
      setFormError(error);
      return;
    }
    const next = {
      ...itemDraft,
      name: itemDraft.name.trim(),
      target: itemDraft.target.trim(),
      cwd: itemDraft.cwd.trim(),
    };
    updateProject({
      ...project,
      items: project.items.some((i) => i.id === next.id)
        ? project.items.map((i) => (i.id === next.id ? next : i))
        : [...project.items, next],
    });
    setItemDraft(null);
    setFilter("all");
    setQuery("");
  }
  async function importData() {
    const data = await api.import();
    if (!data) return;
    const live = await api.runs();
    if (live.some((r) => r.status === "running"))
      throw new Error("실행 중인 명령을 종료한 뒤 데이터를 가져와 주세요.");
    setConfirm({
      title: "데이터를 가져올까요?",
      text: `${data.projects.length}개 프로젝트로 현재 목록을 교체합니다. 기존 데이터는 로컬 백업에 보관됩니다. 등록된 명령어는 자동 실행되지 않습니다.`,
      label: "가져오기",
      action: async () => {
        await persistence.flush();
        await api.save(data);
        current.current = data;
        setWorkspace(data);
        setSelected(data.projects[0]?.id || "");
        setQuery("");
        setSettings(false);
        notify("프로젝트를 가져왔어요.");
      },
    });
  }
  const visibleItems = (
    query.trim() ? workspace.projects : project ? [project] : []
  ).flatMap((owner) =>
    owner.items
      .filter(
        (item) =>
          (matches(owner.name, query) || itemMatches(item, query)) &&
          (filter === "all" ||
            (filter === "command"
              ? item.kind === "command"
              : item.kind !== "command")),
      )
      .map((item) => ({ item, owner })),
  );
  const saveLabel = {
    saved: "모든 변경 사항 저장됨",
    pending: "저장 중…",
    error: "저장 실패 · 다시 시도",
  }[saveStatus];

  return (
    <div className="app-shell">
      <header className="launcher-header">
        <span className="brand-mark" title="Junction">
          <GitFork size={19} />
        </span>
        <select
          aria-label="프로젝트 선택"
          value={selected}
          disabled={!loaded || !workspace.projects.length}
          onChange={(e) => {
            setSelected(e.target.value);
            setQuery("");
          }}
        >
          {!workspace.projects.length && <option value="">Junction</option>}
          {workspace.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <IconButton
          title="항목 추가"
          disabled={!project}
          onClick={() => openItem()}
        >
          <Plus size={19} />
        </IconButton>
        <details className="app-menu" ref={appMenu}>
          <summary aria-label="앱 메뉴" title="앱 메뉴">
            <Ellipsis size={19} />
          </summary>
          <div
            className="menu-content"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button:not(:disabled)"))
                e.currentTarget.closest("details")!.open = false;
            }}
          >
            <button disabled={!loaded} onClick={() => openProject()}>
              <Plus size={15} />새 프로젝트
            </button>
            <button
              disabled={!project}
              onClick={() => project && openProject(project)}
            >
              <Pencil size={15} />
              프로젝트 편집
            </button>
            <button
              disabled={!project || workspace.projects.indexOf(project) === 0}
              onClick={() =>
                project &&
                change({
                  ...workspace,
                  projects: move(
                    workspace.projects,
                    workspace.projects.indexOf(project),
                    -1,
                  ),
                })
              }
            >
              <ArrowUp size={15} />
              프로젝트 위로
            </button>
            <button
              disabled={
                !project ||
                workspace.projects.indexOf(project) ===
                  workspace.projects.length - 1
              }
              onClick={() =>
                project &&
                change({
                  ...workspace,
                  projects: move(
                    workspace.projects,
                    workspace.projects.indexOf(project),
                    1,
                  ),
                })
              }
            >
              <ArrowDown size={15} />
              프로젝트 아래로
            </button>
            <hr />
            <button aria-label="실행 관리" onClick={() => setShowRuns(true)}>
              <Terminal size={15} />
              실행 관리{" "}
              {activeCount > 0 && <span className="count">{activeCount}</span>}
            </button>
            <button disabled={!loaded} onClick={() => setSettings(true)}>
              <Settings2 size={15} />
              데이터 및 앱 정보
            </button>
          </div>
        </details>
      </header>
      {!desktop && (
        <div className="preview-banner">
          미리보기 · 실제 실행은 데스크탑 앱에서
        </div>
      )}
      {project && (
        <div className="search-bar">
          <Search size={15} />
          <input
            aria-label="프로젝트 및 항목 검색"
            placeholder="항목 또는 프로젝트 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <IconButton title="검색 지우기" onClick={() => setQuery("")}>
              <X size={14} />
            </IconButton>
          )}
          <select
            aria-label="항목 종류 필터"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">전체</option>
            <option value="resource">경로·링크</option>
            <option value="command">명령어</option>
          </select>
        </div>
      )}
      <main className="main-content" aria-label="실행 항목">
        {loadError ? (
          <div className="empty-state">
            <CircleHelp size={28} />
            <h1>불러오지 못했어요</h1>
            <p>{loadError}</p>
            <button className="button" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
          </div>
        ) : !loaded ? (
          <div className="empty-state">
            <LoaderCircle className="spin" />
            <p>불러오는 중…</p>
          </div>
        ) : !project ? (
          <div className="empty-state welcome">
            <GitFork size={32} />
            <h1>작업의 시작을 한곳에.</h1>
            <p>
              프로젝트를 만들고 자주 쓰는
              <br />
              폴더, 링크, 명령어를 추가하세요.
            </p>
            <button className="button primary" onClick={() => openProject()}>
              <Plus size={15} />첫 프로젝트 만들기
            </button>
          </div>
        ) : (
          <div className="item-list">
            {visibleItems.map(({ item, owner }) => {
              const Icon = icons[item.kind];
              const run = runs.find((r) => r.itemId === item.id);
              const running = run?.status === "running";
              const canReorder =
                !query.trim() && filter === "all" && owner.id === project.id;
              return (
                <article
                  className={`launch-row ${running ? "is-running" : ""} ${draggingItem === item.id ? "is-dragging" : ""} ${dragTarget === item.id && draggingItem !== item.id ? "is-drag-target" : ""}`}
                  key={item.id}
                  data-item-id={item.id}
                >
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`${item.name} 순서 변경`}
                    title={
                      canReorder
                        ? "드래그해서 순서 변경"
                        : "검색 또는 필터를 해제하면 순서를 변경할 수 있어요"
                    }
                    disabled={!canReorder}
                    onPointerDown={(event) => startItemDrag(event, item.id)}
                    onPointerMove={moveItemDrag}
                    onPointerUp={(event) => finishItemDrag(event, owner.id)}
                    onPointerCancel={(event) => finishItemDrag(event, owner.id)}
                  >
                    <GripVertical size={14} />
                  </button>
                  <button
                    className="item-main"
                    aria-label={`${item.name} 실행`}
                    disabled={running || busy.includes(item.id)}
                    title={`${kindLabels[item.kind]} · ${item.kind === "terminal" ? item.cwd || owner.folder : item.target}${item.kind === "command" ? "\n" + (item.cwd || owner.folder) : ""}`}
                    onClick={() => void launch(item, owner)}
                  >
                    <span className={`item-icon ${item.kind}`}>
                      <Icon size={17} />
                    </span>
                    <span className="item-title">{item.name}</span>
                    {query && (
                      <span className="result-project">{owner.name}</span>
                    )}
                    {busy.includes(item.id) ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      !running && (
                        <ArrowUpRight size={14} className="launch-arrow" />
                      )
                    )}
                  </button>
                  {running && (
                    <>
                      <span className="status running">실행 중</span>
                      <IconButton
                        title={`${item.name} 종료`}
                        onClick={() =>
                          void attempt(async () => {
                            await api.stop(run.id);
                            await refreshRuns();
                          })
                        }
                      >
                        <Square size={13} />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    title={`${item.name} 메뉴`}
                    onClick={() => setItemMenu({ item, owner })}
                  >
                    <Ellipsis size={17} />
                  </IconButton>
                </article>
              );
            })}
            {!visibleItems.length && (
              <div className="empty-state">
                <FolderOpen size={27} />
                <h2>
                  {query || filter !== "all"
                    ? "검색 결과가 없어요"
                    : "아직 등록한 항목이 없어요"}
                </h2>
                <p>
                  {query || filter !== "all"
                    ? "검색어나 필터를 바꿔 보세요."
                    : "위의 + 버튼으로 첫 항목을 추가하세요."}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
      {project && notesOpen && (
        <aside
          className="notes-section"
          id="project-note"
          aria-label="자유메모"
        >
          <div className="note-heading">
            <NotebookPen size={15} />
            <h2>자유메모</h2>
            <span className="note-count">
              {project.note.length.toLocaleString()}자
            </span>
          </div>
          <textarea
            autoFocus
            aria-label="프로젝트 자유메모"
            placeholder="다음 할 일, 잠깐 적어둘 명령어…"
            value={project.note}
            onChange={(e) =>
              updateProject({ ...project, note: e.target.value })
            }
          />
        </aside>
      )}
      <footer className="app-footer">
        {project && (
          <button
            className={`text-button note-toggle ${notesOpen ? "active" : ""}`}
            aria-label={notesOpen ? "메모 접기" : "메모 펼치기"}
            aria-expanded={notesOpen}
            aria-controls="project-note"
            onClick={() => setNotesOpen((open) => !open)}
          >
            <NotebookPen size={14} />
            메모
            {project.note && (
              <span className="memo-dot" aria-label="작성된 메모 있음" />
            )}
          </button>
        )}
        <button className="text-button" onClick={() => setShowRuns(true)}>
          <span className={activeCount ? "live-dot" : "idle-dot"} />
          {activeCount ? `${activeCount}개 실행 중` : "Junction"}
        </button>
        <button
          className={`save-indicator ${saveStatus}`}
          title={saveLabel}
          aria-label={saveLabel}
          onClick={() => void attempt(() => persistence.flush())}
        >
          {saveStatus === "saved" ? (
            <Check size={13} />
          ) : saveStatus === "pending" ? (
            <LoaderCircle className="spin" size={13} />
          ) : (
            <CircleHelp size={13} />
          )}
          <span>
            {saveStatus === "saved"
              ? "저장됨"
              : saveStatus === "pending"
                ? "저장 중…"
                : "저장 실패"}
          </span>
        </button>
      </footer>
      {itemMenu && (
        <Modal title={itemMenu.item.name} close={() => setItemMenu(null)}>
          <p className="item-detail">{kindLabels[itemMenu.item.kind]}</p>
          <code className="item-location">
            {itemMenu.item.kind === "terminal"
              ? itemMenu.item.cwd || itemMenu.owner.folder
              : itemMenu.item.target}
          </code>
          {itemMenu.item.kind === "command" && (
            <p className="item-cwd">
              {itemMenu.item.cwd || itemMenu.owner.folder}
            </p>
          )}
          <div className="action-list">
            <button
              disabled={runs.some(
                (r) => r.itemId === itemMenu.item.id && r.status === "running",
              )}
              onClick={() => {
                setSelected(itemMenu.owner.id);
                openItem(itemMenu.item);
                setItemMenu(null);
              }}
            >
              <Pencil size={15} />
              편집
            </button>
            {itemMenu.item.kind === "command" && (
              <button
                onClick={() =>
                  void attempt(async () => {
                    await navigator.clipboard.writeText(itemMenu.item.target);
                    setItemMenu(null);
                    notify("명령어를 복사했어요.");
                  })
                }
              >
                <Copy size={15} />
                명령어 복사
              </button>
            )}
            <button
              disabled={itemMenu.owner.items.indexOf(itemMenu.item) === 0}
              onClick={() => {
                updateProject({
                  ...itemMenu.owner,
                  items: move(
                    itemMenu.owner.items,
                    itemMenu.owner.items.indexOf(itemMenu.item),
                    -1,
                  ),
                });
                setItemMenu(null);
              }}
            >
              <ArrowUp size={15} />
              위로 이동
            </button>
            <button
              disabled={
                itemMenu.owner.items.indexOf(itemMenu.item) ===
                itemMenu.owner.items.length - 1
              }
              onClick={() => {
                updateProject({
                  ...itemMenu.owner,
                  items: move(
                    itemMenu.owner.items,
                    itemMenu.owner.items.indexOf(itemMenu.item),
                    1,
                  ),
                });
                setItemMenu(null);
              }}
            >
              <ArrowDown size={15} />
              아래로 이동
            </button>
            <button
              className="danger-text"
              disabled={runs.some(
                (r) => r.itemId === itemMenu.item.id && r.status === "running",
              )}
              onClick={() => {
                const { item, owner } = itemMenu;
                setItemMenu(null);
                setConfirm({
                  title: "항목을 삭제할까요?",
                  text: `“${item.name}”을 목록에서 제거합니다. 실제 파일과 폴더는 유지됩니다.`,
                  label: "삭제",
                  action: () =>
                    updateProject({
                      ...owner,
                      items: owner.items.filter((i) => i.id !== item.id),
                    }),
                });
              }}
            >
              <Trash2 size={15} />
              삭제
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <IconButton title="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {projectDraft && (
        <Modal
          title={
            workspace.projects.some((p) => p.id === projectDraft.id)
              ? "프로젝트 편집"
              : "새 프로젝트"
          }
          close={() => setProjectDraft(null)}
        >
          <form onSubmit={saveProject}>
            <label className="field">
              프로젝트 이름
              <input
                autoFocus
                value={projectDraft.name}
                aria-label="프로젝트 이름"
                placeholder="예: 개인 웹사이트"
                maxLength={80}
                onChange={(e) =>
                  setProjectDraft({ ...projectDraft, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              설명 <span className="optional">선택</span>
              <input
                value={projectDraft.description}
                aria-label="설명"
                placeholder="어떤 작업을 하는 프로젝트인가요?"
                maxLength={240}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <label className="field">
              기본 작업 폴더 <span className="optional">선택</span>
              <div className="path-input">
                <input
                  value={projectDraft.folder}
                  aria-label="기본 작업 폴더"
                  placeholder="C:\Projects\my-project"
                  onChange={(e) =>
                    setProjectDraft({ ...projectDraft, folder: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void pick(true, (folder) =>
                      setProjectDraft((prev) => prev && { ...prev, folder }),
                    )
                  }
                >
                  <FolderOpen size={16} /> 선택
                </button>
              </div>
              <small>터미널과 명령어의 기본 실행 위치로 사용합니다.</small>
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-footer">
              {workspace.projects.some((p) => p.id === projectDraft.id) && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => {
                    if (
                      runs.some(
                        (r) =>
                          r.status === "running" &&
                          projectDraft.items.some((i) => i.id === r.itemId),
                      )
                    ) {
                      setFormError(
                        "실행 중인 명령을 종료한 뒤 프로젝트를 삭제해 주세요.",
                      );
                      return;
                    }
                    const id = projectDraft.id;
                    setConfirm({
                      title: "프로젝트를 삭제할까요?",
                      text: "등록된 항목과 메모가 함께 삭제됩니다. 실제 폴더와 파일은 유지됩니다.",
                      label: "삭제",
                      action: () => {
                        const projects = current.current.projects.filter(
                          (p) => p.id !== id,
                        );
                        change({ ...current.current, projects });
                        setSelected(projects[0]?.id || "");
                        setProjectDraft(null);
                      },
                    });
                  }}
                >
                  <Trash2 size={14} /> 삭제
                </button>
              )}
              <div className="spacer" />
              <button
                type="button"
                className="button"
                onClick={() => setProjectDraft(null)}
              >
                취소
              </button>
              <button className="button primary" type="submit">
                프로젝트 저장
              </button>
            </div>
          </form>
        </Modal>
      )}
      {itemDraft && project && (
        <Modal
          title={
            project.items.some((i) => i.id === itemDraft.id)
              ? "항목 편집"
              : "실행 항목 추가"
          }
          close={() => setItemDraft(null)}
          wide
        >
          <form onSubmit={saveItem}>
            <div className="type-picker">
              {Object.entries(kindLabels).map(([key, label]) => {
                const Icon = icons[key as ItemKind];
                return (
                  <button
                    type="button"
                    key={key}
                    className={itemDraft.kind === key ? "active" : ""}
                    onClick={() => {
                      setItemDraft({
                        ...itemDraft,
                        kind: key as ItemKind,
                        target: "",
                        cwd: "",
                      });
                      setFormError("");
                    }}
                  >
                    <Icon size={19} />
                    {label}
                  </button>
                );
              })}
            </div>
            <label className="field">
              이름
              <input
                autoFocus
                value={itemDraft.name}
                aria-label="이름"
                placeholder={
                  itemDraft.kind === "command"
                    ? "예: 개발 서버 시작"
                    : "알아보기 쉬운 이름"
                }
                maxLength={100}
                onChange={(e) =>
                  setItemDraft({ ...itemDraft, name: e.target.value })
                }
              />
            </label>
            {itemDraft.kind !== "terminal" && (
              <label className="field">
                {itemDraft.kind === "command"
                  ? "명령어"
                  : itemDraft.kind === "url"
                    ? "웹 주소"
                    : "경로"}
                {itemDraft.kind === "command" ? (
                  <>
                    <textarea
                      className="command-input"
                      value={itemDraft.target}
                      aria-label="명령어"
                      placeholder="npm run dev"
                      spellCheck={false}
                      onChange={(e) =>
                        setItemDraft({ ...itemDraft, target: e.target.value })
                      }
                    />
                    <small>
                      평소 PowerShell에서 쓰는 명령어를 그대로 입력하세요. 여러
                      줄도 가능합니다.
                    </small>
                  </>
                ) : (
                  <div className="path-input">
                    <input
                      value={itemDraft.target}
                      aria-label={itemDraft.kind === "url" ? "웹 주소" : "경로"}
                      placeholder={
                        itemDraft.kind === "url"
                          ? "https://notion.so/… 또는 https://github.com/…"
                          : "파일 또는 폴더 경로"
                      }
                      onChange={(e) =>
                        setItemDraft({ ...itemDraft, target: e.target.value })
                      }
                    />
                    {itemDraft.kind !== "url" && (
                      <button
                        className="button"
                        type="button"
                        onClick={() =>
                          void pick(itemDraft.kind === "folder", (target) =>
                            setItemDraft((prev) => prev && { ...prev, target }),
                          )
                        }
                      >
                        <FolderOpen size={16} /> 선택
                      </button>
                    )}
                  </div>
                )}
              </label>
            )}
            {["terminal", "command"].includes(itemDraft.kind) && (
              <label className="field">
                실행 폴더
                <div className="path-input">
                  <input
                    value={itemDraft.cwd}
                    aria-label="실행 폴더"
                    placeholder={
                      project.folder || "실행할 폴더를 선택해 주세요"
                    }
                    onChange={(e) =>
                      setItemDraft({ ...itemDraft, cwd: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      void pick(true, (cwd) =>
                        setItemDraft((prev) => prev && { ...prev, cwd }),
                      )
                    }
                  >
                    <FolderOpen size={16} /> 선택
                  </button>
                </div>
                <small>
                  {itemDraft.cwd
                    ? "이 항목은 지정한 폴더에서 실행합니다."
                    : project.folder
                      ? "비워두면 프로젝트 기본 폴더를 따릅니다."
                      : "프로젝트 기본 폴더가 없어 실행 폴더를 지정해야 합니다."}
                </small>
              </label>
            )}
            {itemDraft.kind === "command" && (
              <div className="command-info">
                <Terminal size={17} />
                <span>
                  {env.shell === "pwsh" ? "PowerShell 7" : "Windows PowerShell"}{" "}
                  · 별도 창에서 실행
                  <br />
                  <small>
                    실행 상태를 추적하고, 하위 프로세스까지 함께 종료할 수
                    있어요.
                  </small>
                </span>
              </div>
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-footer">
              {itemDraft.kind === "command" && (
                <button
                  type="button"
                  className="button"
                  disabled={
                    busy.includes(itemDraft.id) ||
                    runs.some(
                      (r) =>
                        r.itemId === itemDraft.id && r.status === "running",
                    )
                  }
                  onClick={() => void launch(itemDraft)}
                >
                  <Play size={14} /> 실행해 보기
                </button>
              )}
              <div className="spacer" />
              <button
                type="button"
                className="button"
                onClick={() => setItemDraft(null)}
              >
                취소
              </button>
              <button type="submit" className="button primary">
                항목 저장
              </button>
            </div>
            {itemDraft.kind === "command" &&
              runs
                .filter((r) => r.itemId === itemDraft.id)
                .slice(0, 1)
                .map((run) => (
                  <div className="test-run" key={run.id}>
                    <span>테스트 실행: {statuses[run.status]}</span>
                    {run.consoleOpen && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          void attempt(async () => {
                            await api.stop(run.id);
                            await refreshRuns();
                          })
                        }
                      >
                        {run.status === "running" ? "종료" : "터미널 닫기"}
                      </button>
                    )}
                  </div>
                ))}
          </form>
        </Modal>
      )}
      {showRuns && (
        <Modal title="전체 실행 관리" close={() => setShowRuns(false)} wide>
          {toast?.error && (
            <p className="form-error" role="alert">
              {toast.text}
            </p>
          )}
          <p className="confirm-text">
            저장하지 않은 테스트 실행도 여기에서 종료할 수 있습니다.
          </p>
          <div className="run-list">
            {runs.map((run) => (
              <div className="run-row" key={run.id}>
                <span className={`status ${run.status}`}>
                  {statuses[run.status]}
                </span>
                <div className="run-name">
                  <strong>{run.name}</strong>
                  <span>
                    PID {run.pid}
                    {run.exitCode !== null && ` · 종료 코드 ${run.exitCode}`}
                  </span>
                </div>
                {run.consoleOpen && (
                  <button
                    className="button small"
                    onClick={() =>
                      void attempt(async () => {
                        await api.stop(run.id);
                        await refreshRuns();
                      })
                    }
                  >
                    <Square size={12} />
                    {run.status === "running" ? "종료" : "터미널 닫기"}
                  </button>
                )}
              </div>
            ))}
            {!runs.length && (
              <p className="runs-empty">아직 실행한 명령이 없습니다.</p>
            )}
          </div>
        </Modal>
      )}
      {settings && (
        <Modal title="데이터 및 앱 정보" close={() => setSettings(false)}>
          <div className="settings-content">
            {toast?.error && (
              <p className="form-error" role="alert">
                {toast.text}
              </p>
            )}
            <p>프로젝트와 메모는 이 컴퓨터에 자동 저장됩니다.</p>
            <div className="data-path">
              <span>저장 위치</span>
              <code>{env.dataDir}</code>
            </div>
            <div className="settings-actions">
              <button
                className="button"
                onClick={() =>
                  void attempt(async () => {
                    await persistence.flush();
                    if (await api.export(current.current))
                      notify("데이터를 내보냈어요.");
                  })
                }
              >
                <Download size={16} /> JSON 내보내기
              </button>
              <button
                className="button"
                onClick={() => void attempt(importData)}
              >
                <Upload size={16} /> JSON 가져오기
              </button>
            </div>
            <div className="settings-note">
              <h3>명령어 실행 안내</h3>
              <p>
                명령어는 감지된 PowerShell에서 실행합니다. 실행이 끝나도 터미널
                창은 유지됩니다.
              </p>
              <p>
                Junction을 종료하면 관리 중인 명령과 터미널도 종료됩니다. 실행
                기록은 현재 세션 동안 보관됩니다.
              </p>
              <p>
                ‘터미널 위치’로 연 창과 ‘로컬 앱’은 상태 추적 대상에 포함되지
                않습니다.
              </p>
            </div>
            <div className="about-brand">
              <GitFork size={22} />
              <strong>Junction</strong>
              <span>0.2.0 · 나만의 프로젝트 허브</span>
            </div>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} close={() => setConfirm(null)}>
          <p className="confirm-text">{confirm.text}</p>
          <div className="modal-footer">
            <button className="button" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="button primary"
              onClick={() => {
                const action = confirm.action;
                setConfirm(null);
                void attempt(async () => {
                  await action();
                });
              }}
            >
              {confirm.label || "확인"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
