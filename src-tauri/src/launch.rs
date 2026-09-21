use crate::{
    model::{Item, Kind},
    storage::err,
};
use base64::Engine;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Running,
    Succeeded,
    Failed,
    Stopped,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub item_id: String,
    pub name: String,
    pub status: Status,
    pub pid: u32,
    pub exit_code: Option<u32>,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub console_open: bool,
}
struct Entry {
    run: Run,
    process: native::OwnedProcess,
    dir: PathBuf,
}
impl Drop for Entry {
    fn drop(&mut self) {
        let _ = self.process.stop();
        let _ = fs::remove_dir_all(&self.dir);
    }
}
#[derive(Default)]
pub struct Launcher {
    entries: HashMap<String, Entry>,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn shell_path() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join("pwsh.exe");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    let path =
        PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()))
            .join("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    if path.is_file() {
        Ok(path)
    } else {
        Err("PowerShell을 찾을 수 없습니다. Windows PowerShell 설치를 확인해 주세요.".into())
    }
}
fn directory(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.is_dir() {
        return Err(format!("실행 폴더를 찾을 수 없습니다: {}", path.display()));
    }
    Ok(path)
}
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}
fn encoded(script: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(
        script
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>(),
    )
}
impl Launcher {
    pub fn list(&mut self) -> Result<Vec<Run>, String> {
        for entry in self.entries.values_mut() {
            let active = entry.process.active_count()?;
            entry.run.console_open = active > 0;
            if entry.run.status != Status::Running {
                continue;
            }
            let root_exit = entry.process.exit_code()?;
            let marker = fs::read_to_string(entry.dir.join("result.txt"))
                .ok()
                .and_then(|v| v.trim().parse::<i64>().ok())
                .map(|code| code as u32);
            // The idle PowerShell console is the sole remaining process after a command.
            // A detached child keeps the run active even if its original shell has exited.
            let work = entry.process.work_count()?;
            let completed = if root_exit.is_some() {
                work == 0
            } else {
                marker.is_some() && work <= 1
            };
            if completed {
                let code = marker.or(root_exit).unwrap_or(1);
                entry.run.status = if code == 0 {
                    Status::Succeeded
                } else {
                    Status::Failed
                };
                entry.run.exit_code = Some(code);
                entry.run.ended_at = Some(now());
            }
        }
        let mut runs: Vec<_> = self.entries.values().map(|e| e.run.clone()).collect();
        runs.sort_by_key(|r| std::cmp::Reverse(r.started_at));
        Ok(runs)
    }
    pub fn start(
        &mut self,
        item: &Item,
        folder: &str,
        base: &Path,
        visible: bool,
    ) -> Result<Run, String> {
        item.validate(folder)?;
        if item.kind != Kind::Command {
            return Err("명령어 항목만 추적 실행할 수 있습니다.".into());
        }
        if self
            .list()?
            .iter()
            .any(|r| r.item_id == item.id && r.status == Status::Running)
        {
            return Err("이미 실행 중입니다. 종료 후 다시 실행해 주세요.".into());
        }
        // Keep only the newest 100 closed runs; active/visible runs are never discarded.
        let mut finished: Vec<_> = self
            .entries
            .values()
            .filter(|e| !e.run.console_open)
            .map(|e| (e.run.started_at, e.run.id.clone()))
            .collect();
        finished.sort();
        let excess = finished.len().saturating_sub(99);
        for (_, id) in finished.into_iter().take(excess) {
            self.entries.remove(&id);
        }
        let cwd = directory(item.directory(folder))?;
        let shell = shell_path()?;
        let id = uuid::Uuid::new_v4().to_string();
        let dir = base.join(&id);
        fs::create_dir_all(&dir).map_err(err)?;
        let result = (|| {
            let script_path = dir.join("command.ps1");
            // BOM is required for Korean source text in Windows PowerShell 5.1.
            fs::write(&script_path, format!("\u{feff}{}", item.target)).map_err(err)?;
            let result_path = ps_quote(&dir.join("result.txt").to_string_lossy());
            let script = format!(
                "$Host.UI.RawUI.WindowTitle = {}; $global:LASTEXITCODE = 0; $junctionCode = 0; try {{ & {}; $junctionOk = $?; $junctionCode = $global:LASTEXITCODE; if (-not $junctionOk -and $junctionCode -eq 0) {{ $junctionCode = 1 }} }} catch {{ Write-Host $_ -ForegroundColor Red; $junctionCode = 1 }}; [System.IO.File]::WriteAllText({}, [string]$junctionCode); Write-Host ('`n[Junction] exit code: ' + $junctionCode) -ForegroundColor DarkGray; {}",
                ps_quote(&format!("Junction · {}", item.name)), ps_quote(&script_path.to_string_lossy()), result_path,
                if visible { "" } else { "exit $junctionCode" }
            );
            let args = format!(
                "-NoLogo -NoProfile {} -ExecutionPolicy Bypass -EncodedCommand {}",
                if visible { "-NoExit" } else { "" },
                encoded(&script)
            );
            let process = native::OwnedProcess::spawn(&shell, &args, &cwd, visible)?;
            let run = Run {
                id: id.clone(),
                item_id: item.id.clone(),
                name: item.name.clone(),
                status: Status::Running,
                pid: process.pid,
                exit_code: None,
                started_at: now(),
                ended_at: None,
                console_open: true,
            };
            Ok(Entry {
                run,
                process,
                dir: dir.clone(),
            })
        })();
        match result {
            Ok(entry) => {
                let run = entry.run.clone();
                self.entries.insert(id, entry);
                Ok(run)
            }
            Err(e) => {
                let _ = fs::remove_dir_all(&dir);
                Err(e)
            }
        }
    }
    pub fn stop(&mut self, id: &str) -> Result<(), String> {
        self.list()?;
        let entry = self
            .entries
            .get_mut(id)
            .ok_or("Junction이 실행한 프로세스가 아닙니다.")?;
        entry.process.stop()?;
        if entry.run.status == Status::Running {
            entry.run.status = Status::Stopped;
            entry.run.ended_at = Some(now());
        }
        entry.run.console_open = false;
        Ok(())
    }
    pub fn shutdown(&mut self) {
        self.entries.clear();
    }
}
pub fn open_item(item: &Item, folder: &str) -> Result<(), String> {
    item.validate(folder)?;
    match item.kind {
        Kind::Url => native::open(&item.target, None, None),
        Kind::Folder => {
            directory(&item.target)?;
            native::open(&item.target, None, None)
        }
        Kind::App => {
            let path = Path::new(&item.target);
            if !path.is_absolute() || !path.is_file() {
                return Err("실행 파일을 찾을 수 없습니다.".into());
            }
            if !path.extension().is_some_and(|v| {
                ["exe", "lnk"].contains(&v.to_string_lossy().to_lowercase().as_str())
            }) {
                return Err("앱은 .exe 실행 파일 또는 .lnk 바로가기를 선택해 주세요.".into());
            }
            native::open(&item.target, None, path.parent())
        }
        Kind::Terminal => {
            let cwd = directory(item.directory(folder))?;
            native::open(
                &shell_path()?.to_string_lossy(),
                Some("-NoLogo -NoExit"),
                Some(&cwd),
            )
        }
        Kind::Command => Err("명령어 실행 경로를 사용해 주세요.".into()),
    }
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::{
        mem::{size_of, zeroed},
        os::windows::ffi::OsStrExt,
        ptr::{null, null_mut},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0},
        System::{JobObjects::*, Threading::*},
        UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };
    fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
        s.as_ref().encode_wide().chain(Some(0)).collect()
    }
    struct Handle(HANDLE);
    // Owned kernel handles may cross threads. Launcher serializes all access with a mutex.
    unsafe impl Send for Handle {}
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    pub struct OwnedProcess {
        job: Handle,
        process: Handle,
        pub pid: u32,
    }
    impl OwnedProcess {
        pub fn spawn(exe: &Path, args: &str, cwd: &Path, visible: bool) -> Result<Self, String> {
            unsafe {
                let job_raw = CreateJobObjectW(null(), null());
                if job_raw.is_null() {
                    return Err(err(std::io::Error::last_os_error()));
                }
                let job = Handle(job_raw);
                let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(
                    job.0,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as _,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ) == 0
                {
                    return Err(err(std::io::Error::last_os_error()));
                }
                let app = wide(exe);
                let mut command = wide(format!("\"{}\" {}", exe.display(), args));
                let cwd = wide(cwd);
                let mut startup: STARTUPINFOW = zeroed();
                startup.cb = size_of::<STARTUPINFOW>() as u32;
                let mut info: PROCESS_INFORMATION = zeroed();
                let flags = CREATE_SUSPENDED
                    | if visible {
                        CREATE_NEW_CONSOLE
                    } else {
                        CREATE_NO_WINDOW
                    };
                if CreateProcessW(
                    app.as_ptr(),
                    command.as_mut_ptr(),
                    null(),
                    null(),
                    0,
                    flags,
                    null(),
                    cwd.as_ptr(),
                    &startup,
                    &mut info,
                ) == 0
                {
                    return Err(format!(
                        "터미널 실행 실패: {}",
                        std::io::Error::last_os_error()
                    ));
                }
                let process = Handle(info.hProcess);
                let thread = Handle(info.hThread);
                // Assign before any user command can run or create descendants.
                if AssignProcessToJobObject(job.0, process.0) == 0 {
                    let error = std::io::Error::last_os_error();
                    TerminateProcess(process.0, 1);
                    return Err(format!("프로세스 관리 그룹 생성 실패: {error}"));
                }
                if ResumeThread(thread.0) == u32::MAX {
                    TerminateJobObject(job.0, 1);
                    return Err(err(std::io::Error::last_os_error()));
                }
                Ok(Self {
                    job,
                    process,
                    pid: info.dwProcessId,
                })
            }
        }
        pub fn active_count(&self) -> Result<u32, String> {
            unsafe {
                let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = zeroed();
                if QueryInformationJobObject(
                    self.job.0,
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as _,
                    size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    null_mut(),
                ) == 0
                {
                    return Err(err(std::io::Error::last_os_error()));
                }
                Ok(info.ActiveProcesses)
            }
        }
        pub fn work_count(&self) -> Result<u32, String> {
            // Windows can add its own conhost process to the job when a visible
            // console is created. Keep owning it, but do not count it as user work.
            let host = PathBuf::from(
                std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()),
            )
            .join("System32\\conhost.exe")
            .to_string_lossy()
            .to_lowercase();
            let mut capacity = 32usize;
            loop {
                unsafe {
                    let bytes = size_of::<JOBOBJECT_BASIC_PROCESS_ID_LIST>()
                        + (capacity - 1) * size_of::<usize>();
                    let mut buffer = vec![0usize; bytes.div_ceil(size_of::<usize>())];
                    if QueryInformationJobObject(
                        self.job.0,
                        JobObjectBasicProcessIdList,
                        buffer.as_mut_ptr().cast(),
                        bytes as u32,
                        null_mut(),
                    ) == 0
                    {
                        let error = std::io::Error::last_os_error();
                        if error.raw_os_error() == Some(234) && capacity < 65536 {
                            capacity *= 2;
                            continue;
                        }
                        return Err(err(error));
                    }
                    let list = buffer.as_ptr().cast::<JOBOBJECT_BASIC_PROCESS_ID_LIST>();
                    let count = (*list).NumberOfProcessIdsInList as usize;
                    let pids = std::slice::from_raw_parts(
                        std::ptr::addr_of!((*list).ProcessIdList).cast::<usize>(),
                        count,
                    );
                    let mut work = 0;
                    for &pid in pids {
                        let raw = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid as u32);
                        if raw.is_null() {
                            work += 1;
                            continue;
                        }
                        let process = Handle(raw);
                        let mut path = vec![0u16; 32768];
                        let mut length = path.len() as u32;
                        if QueryFullProcessImageNameW(process.0, 0, path.as_mut_ptr(), &mut length)
                            == 0
                            || String::from_utf16_lossy(&path[..length as usize]).to_lowercase()
                                != host
                        {
                            work += 1;
                        }
                    }
                    return Ok(work);
                }
            }
        }
        pub fn exit_code(&self) -> Result<Option<u32>, String> {
            unsafe {
                if WaitForSingleObject(self.process.0, 0) != WAIT_OBJECT_0 {
                    return Ok(None);
                }
                let mut code = 0;
                if GetExitCodeProcess(self.process.0, &mut code) == 0 {
                    return Err(err(std::io::Error::last_os_error()));
                }
                Ok(Some(code))
            }
        }
        pub fn stop(&self) -> Result<(), String> {
            unsafe {
                if TerminateJobObject(self.job.0, 1) == 0 {
                    return Err(err(std::io::Error::last_os_error()));
                }
                Ok(())
            }
        }
    }
    pub fn open(target: &str, args: Option<&str>, cwd: Option<&Path>) -> Result<(), String> {
        let verb = wide("open");
        let target = wide(target);
        let args = args.map(wide);
        let cwd = cwd.map(wide);
        let result = unsafe {
            ShellExecuteW(
                null_mut(),
                verb.as_ptr(),
                target.as_ptr(),
                args.as_ref().map_or(null(), |v| v.as_ptr()),
                cwd.as_ref().map_or(null(), |v| v.as_ptr()),
                SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            Err(format!(
                "항목을 열 수 없습니다. 경로와 연결 프로그램을 확인해 주세요. (Windows {})",
                result as isize
            ))
        } else {
            Ok(())
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        os::windows::process::CommandExt,
        process::Command,
        thread,
        time::{Duration, Instant},
    };
    fn item(command: &str) -> Item {
        Item {
            id: uuid::Uuid::new_v4().to_string(),
            name: "테스트".into(),
            kind: Kind::Command,
            target: command.into(),
            cwd: "".into(),
        }
    }
    fn wait(launcher: &mut Launcher, id: &str) -> Run {
        let until = Instant::now() + Duration::from_secs(25);
        loop {
            let run = launcher
                .list()
                .unwrap()
                .into_iter()
                .find(|r| r.id == id)
                .unwrap();
            if run.status != Status::Running {
                return run;
            }
            assert!(
                Instant::now() < until,
                "command did not finish: {run:?}; active={:?}; marker={:?}",
                launcher.entries[id].process.active_count(),
                fs::read_to_string(launcher.entries[id].dir.join("result.txt"))
            );
            thread::sleep(Duration::from_millis(50));
        }
    }
    #[test]
    fn success_failure_unicode_and_working_directory() {
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().join("한글 ' 작업 폴더");
        fs::create_dir(&cwd).unwrap();
        let mut l = Launcher::default();
        let run = l
            .start(
                &item("[IO.File]::WriteAllText((Join-Path (Get-Location) '결과.txt'), '안녕')"),
                cwd.to_str().unwrap(),
                temp.path(),
                false,
            )
            .unwrap();
        assert_eq!(wait(&mut l, &run.id).status, Status::Succeeded);
        assert_eq!(fs::read_to_string(cwd.join("결과.txt")).unwrap(), "안녕");
        let run = l
            .start(
                &item("cmd.exe /c exit 7"),
                cwd.to_str().unwrap(),
                temp.path(),
                false,
            )
            .unwrap();
        let failed = wait(&mut l, &run.id);
        assert_eq!(failed.status, Status::Failed);
        assert_eq!(failed.exit_code, Some(7));
        let run = l
            .start(
                &item("throw 'test'"),
                cwd.to_str().unwrap(),
                temp.path(),
                false,
            )
            .unwrap();
        assert_eq!(wait(&mut l, &run.id).status, Status::Failed);
    }
    #[test]
    fn stops_only_owned_tree_and_rejects_duplicate() {
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().to_str().unwrap();
        let mut l = Launcher::default();
        let mut unrelated = Command::new(shell_path().unwrap())
            .args(["-NoProfile", "-Command", "Start-Sleep 40"])
            .creation_flags(0x08000000)
            .spawn()
            .unwrap();
        let pid_file = temp.path().join("child.txt");
        let command = format!("$p = Start-Process -FilePath {} -ArgumentList '-NoProfile','-Command','Start-Sleep 40' -PassThru -WindowStyle Hidden; [IO.File]::WriteAllText({}, [string]$p.Id); Start-Sleep 40", ps_quote(&shell_path().unwrap().to_string_lossy()), ps_quote(&pid_file.to_string_lossy()));
        let item = item(&command);
        let run = l.start(&item, cwd, temp.path(), false).unwrap();
        assert!(l.start(&item, cwd, temp.path(), false).is_err());
        assert!(l.stop("not-owned").is_err());
        let until = Instant::now() + Duration::from_secs(15);
        while !pid_file.exists() {
            assert!(Instant::now() < until);
            thread::sleep(Duration::from_millis(50));
        }
        let child: u32 = fs::read_to_string(&pid_file).unwrap().parse().unwrap();
        l.stop(&run.id).unwrap();
        thread::sleep(Duration::from_millis(300));
        assert_eq!(l.list().unwrap()[0].status, Status::Stopped);
        assert!(unrelated.try_wait().unwrap().is_none());
        unsafe {
            use windows_sys::Win32::{
                Foundation::{CloseHandle, WAIT_OBJECT_0},
                System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
            };
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, child);
            if !handle.is_null() {
                assert_eq!(WaitForSingleObject(handle, 5000), WAIT_OBJECT_0);
                CloseHandle(handle);
            }
        }
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
    }
    #[test]
    fn shutdown_terminates_owned_process() {
        let temp = tempfile::tempdir().unwrap();
        let mut l = Launcher::default();
        let run = l
            .start(
                &item("Start-Sleep 40"),
                temp.path().to_str().unwrap(),
                temp.path(),
                false,
            )
            .unwrap();
        unsafe {
            use windows_sys::Win32::{
                Foundation::{CloseHandle, WAIT_OBJECT_0},
                System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
            };
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, run.pid);
            assert!(!handle.is_null());
            l.shutdown();
            assert_eq!(WaitForSingleObject(handle, 5000), WAIT_OBJECT_0);
            CloseHandle(handle);
        }
    }

    #[test]
    fn missing_directory_never_starts_a_process() {
        let temp = tempfile::tempdir().unwrap();
        let mut l = Launcher::default();
        assert!(l
            .start(
                &item("Write-Output test"),
                temp.path().join("missing").to_str().unwrap(),
                temp.path(),
                false
            )
            .is_err());
        assert!(l.list().unwrap().is_empty());
    }

    #[test]
    fn root_exit_keeps_descendants_tracked() {
        let temp = tempfile::tempdir().unwrap();
        let mut l = Launcher::default();
        let command = format!("Start-Process -FilePath {} -ArgumentList '-NoProfile','-Command','Start-Sleep 40' -WindowStyle Hidden; exit 0", ps_quote(&shell_path().unwrap().to_string_lossy()));
        let run = l
            .start(
                &item(&command),
                temp.path().to_str().unwrap(),
                temp.path(),
                false,
            )
            .unwrap();
        let until = Instant::now() + Duration::from_secs(15);
        while l.entries[&run.id].process.exit_code().unwrap().is_none() {
            assert!(Instant::now() < until);
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(l.list().unwrap()[0].status, Status::Running);
        l.stop(&run.id).unwrap();
        assert_eq!(l.list().unwrap()[0].status, Status::Stopped);
    }

    #[test]
    #[ignore = "Opens a native console; run explicitly during desktop verification"]
    fn visible_console_reports_completion_and_retains_output() {
        let temp = tempfile::tempdir().unwrap();
        let mut l = Launcher::default();
        let run = l
            .start(
                &item("Write-Output 'Junction console verification'"),
                temp.path().to_str().unwrap(),
                temp.path(),
                true,
            )
            .unwrap();
        let finished = wait(&mut l, &run.id);
        assert_eq!(finished.status, Status::Succeeded);
        assert!(finished.console_open);
        assert!(l.entries[&run.id].process.exit_code().unwrap().is_none());
        l.stop(&run.id).unwrap();
        assert_eq!(l.list().unwrap()[0].status, Status::Succeeded);
        let failed = l
            .start(
                &item("cmd.exe /c exit -1"),
                temp.path().to_str().unwrap(),
                temp.path(),
                true,
            )
            .unwrap();
        let failure = wait(&mut l, &failed.id);
        assert_eq!(failure.status, Status::Failed);
        assert_eq!(failure.exit_code, Some(u32::MAX));
        assert!(failure.console_open);
        l.stop(&failed.id).unwrap();
    }
}
