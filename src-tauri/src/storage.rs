use crate::model::Workspace;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub struct Store {
    pub dir: PathBuf,
}
#[derive(serde::Serialize)]
pub struct Loaded {
    pub workspace: Workspace,
    pub warning: Option<String>,
}
impl Store {
    pub fn load(&self) -> Result<Loaded, String> {
        let path = self.dir.join("workspace.json");
        if !path.exists() {
            return Ok(Loaded {
                workspace: Workspace::default(),
                warning: None,
            });
        }
        match read(&path) {
            Ok(workspace) => Ok(Loaded {
                workspace,
                warning: None,
            }),
            Err(original) => {
                let workspace = read(&self.dir.join("workspace.backup.json")).map_err(|_| {
                    format!("데이터를 읽을 수 없습니다. 원본을 보존했습니다. {original}")
                })?;
                Ok(Loaded {
                    workspace,
                    warning: Some("저장 파일을 읽을 수 없어 이전 백업을 불러왔습니다.".into()),
                })
            }
        }
    }
    pub fn save(&self, data: &Workspace) -> Result<(), String> {
        data.validate()?;
        fs::create_dir_all(&self.dir).map_err(err)?;
        let path = self.dir.join("workspace.json");
        // Only rotate a valid original; keep the recovery backup intact after corruption.
        if path.exists() && read(&path).is_ok() {
            atomic_write(
                &self.dir.join("workspace.backup.json"),
                &fs::read(&path).map_err(err)?,
            )?;
        }
        atomic_write(&path, &serde_json::to_vec_pretty(data).map_err(err)?)
    }
}
pub fn read(path: &Path) -> Result<Workspace, String> {
    let bytes = fs::read(path).map_err(err)?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("데이터 파일은 10MB 이하여야 합니다.".into());
    }
    let data: Workspace = serde_json::from_slice(&bytes).map_err(err)?;
    data.validate()?;
    Ok(data)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(err)?;
        file.write_all(bytes).map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file);
        replace(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(err(std::io::Error::last_os_error()));
    }
    Ok(())
}
#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(err)
}
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Project;
    fn data(name: &str) -> Workspace {
        Workspace {
            version: 1,
            projects: vec![Project {
                id: "p".into(),
                name: name.into(),
                description: "".into(),
                folder: "".into(),
                note: "다음 할 일\n명령어".into(),
                items: vec![],
            }],
        }
    }
    #[test]
    fn save_reload_and_recover_backup() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store {
            dir: temp.path().join("한글 폴더"),
        };
        store.save(&data("첫 저장")).unwrap();
        store.save(&data("둘째 저장")).unwrap();
        assert_eq!(store.load().unwrap().workspace, data("둘째 저장"));
        fs::write(store.dir.join("workspace.json"), "broken").unwrap();
        let recovered = store.load().unwrap();
        assert!(recovered.warning.is_some());
        assert_eq!(recovered.workspace, data("첫 저장"));
        store.save(&recovered.workspace).unwrap();
        assert_eq!(
            read(&store.dir.join("workspace.backup.json")).unwrap(),
            data("첫 저장")
        );
    }
    #[test]
    fn invalid_import_does_not_replace_data() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store {
            dir: temp.path().into(),
        };
        store.save(&data("keep")).unwrap();
        let mut bad = data("bad");
        bad.version = 99;
        assert!(store.save(&bad).is_err());
        bad.version = 1;
        bad.projects.push(bad.projects[0].clone());
        assert!(store.save(&bad).is_err());
        assert_eq!(store.load().unwrap().workspace, data("keep"));
    }
}
