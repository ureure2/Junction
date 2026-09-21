use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    pub version: u32,
    pub projects: Vec<Project>,
}
impl Default for Workspace {
    fn default() -> Self {
        Self {
            version: 1,
            projects: vec![],
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub folder: String,
    pub note: String,
    pub items: Vec<Item>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub target: String,
    pub cwd: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Folder,
    Url,
    App,
    Terminal,
    Command,
}
impl Workspace {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("지원하지 않는 데이터 버전입니다.".into());
        }
        let mut ids = HashSet::new();
        for p in &self.projects {
            if p.id.is_empty() || !ids.insert(&p.id) || p.name.trim().is_empty() {
                return Err("프로젝트 이름 또는 ID가 올바르지 않습니다.".into());
            }
            for i in &p.items {
                if i.id.is_empty() || !ids.insert(&i.id) {
                    return Err("항목 ID가 중복되거나 비어 있습니다.".into());
                }
                i.validate(&p.folder)?;
            }
        }
        Ok(())
    }
}
impl Item {
    pub fn validate(&self, folder: &str) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("항목 이름을 입력해 주세요.".into());
        }
        if self.target.contains('\0') || self.cwd.contains('\0') || folder.contains('\0') {
            return Err("경로나 명령어에 사용할 수 없는 문자가 있습니다.".into());
        }
        if self.kind != Kind::Terminal && self.target.trim().is_empty() {
            return Err("경로 또는 명령어를 입력해 주세요.".into());
        }
        if self.kind == Kind::Url {
            let url =
                url::Url::parse(&self.target).map_err(|_| "올바른 웹 주소를 입력해 주세요.")?;
            if !["http", "https"].contains(&url.scheme()) || url.host_str().is_none() {
                return Err("http 또는 https 주소만 사용할 수 있습니다.".into());
            }
        }
        if matches!(self.kind, Kind::Terminal | Kind::Command)
            && self.directory(folder).trim().is_empty()
        {
            return Err("실행 폴더를 지정해 주세요.".into());
        }
        Ok(())
    }
    pub fn directory<'a>(&'a self, folder: &'a str) -> &'a str {
        if self.cwd.trim().is_empty() {
            folder
        } else {
            &self.cwd
        }
    }
}
