# Junction

프로젝트마다 흩어진 폴더, 웹 페이지, 앱, 터미널 명령과 메모를 한곳에 모아 두는 Windows용 소형 런처입니다.

<img width="422" height="552" alt="Junction에서 샘플 프로젝트를 관리하는 화면" src="https://github.com/user-attachments/assets/65e1614e-cc5a-403e-953a-b7f108f21705" />

Junction은 작업 환경을 대신 구성하거나 명령을 자동 실행하지 않습니다. 필요한 항목을 프로젝트별로 정리해 두고, 원할 때 직접 실행할 수 있게 도와줍니다.

## 주요 기능

- 프로젝트별 폴더, 웹 링크, 로컬 앱과 터미널 위치 관리
- PowerShell 명령 등록, 실행 상태 확인 및 종료
- 드래그 앤 드롭으로 프로젝트와 항목 순서 변경
- 이름, 경로, URL과 명령어 통합 검색
- 프로젝트별 자유 메모 자동 저장
- 작업 데이터 JSON 내보내기 및 가져오기
- 로컬 자동 백업과 손상된 저장 파일 복구

## 설치

Windows 10/11 x64용 설치 파일은 [GitHub Releases](https://github.com/ureure2/Junction/releases)에서 내려받을 수 있습니다.

현재 설치 파일에는 코드 서명이 적용되지 않았습니다. Windows에서 보호 안내가 나타나면 게시자와 파일 출처를 확인한 뒤 실행하세요. Junction은 현재 Windows 사용자 계정에 설치됩니다.

## 빠른 시작

1. Junction을 열고 프로젝트를 만듭니다.
2. 필요하면 프로젝트의 기본 작업 폴더를 지정합니다.
3. **항목 추가**에서 폴더, 웹 링크, 로컬 앱, 터미널 위치 또는 터미널 명령어를 등록합니다.
4. 항목 이름을 눌러 실행하고, 왼쪽 핸들을 드래그해 순서를 정리합니다.
5. 하단의 **메모**에 다음 할 일이나 자주 쓰는 내용을 기록합니다.

상단에서는 프로젝트를 선택하거나 검색할 수 있고, `⋯` 메뉴에서는 프로젝트 설정, 실행 기록과 데이터 관리 기능을 이용할 수 있습니다. 기본 창 크기는 420×520이며 최소 360×420까지 줄일 수 있습니다.

## 터미널 명령어

- 명령마다 이름, 실행 위치와 PowerShell 명령을 등록할 수 있습니다. 실행 위치를 비워 두면 프로젝트의 기본 폴더를 사용합니다.
- PowerShell 7이 설치되어 있으면 우선 사용하고, 없으면 Windows PowerShell로 실행합니다.
- 실행 중, 완료, 실패, 종료됨 상태를 확인할 수 있으며 같은 항목의 중복 실행을 막습니다.
- Junction에서 시작한 명령만 추적하고 종료합니다. 다른 앱에서 실행한 프로세스에는 영향을 주지 않습니다.
- 등록한 명령은 앱을 열 때 자동으로 실행되지 않습니다.

터미널 위치로 연 일반 터미널과 로컬 앱은 실행 관리 대상이 아닙니다. Docker, WSL 또는 원격 환경처럼 외부 서비스에서 계속 실행되는 작업은 해당 환경에서 별도로 관리해야 합니다.

## 데이터 저장과 백업

작업 데이터는 `%APPDATA%\com.junction.desktop`에 저장됩니다. 앱의 **데이터 및 앱 정보** 메뉴에서도 실제 위치를 확인할 수 있습니다.

- `workspace.json`: 프로젝트, 실행 항목과 메모
- `workspace.backup.json`: 직전에 정상적으로 저장된 백업본

저장 중에는 임시 파일에 먼저 기록한 뒤 기존 파일을 교체합니다. 원본이 손상되면 백업본으로 복구하고 화면에 안내하며, 원본과 백업본을 모두 읽을 수 없을 때는 기존 파일을 자동으로 덮어쓰지 않습니다.

JSON 내보내기와 가져오기로 별도 백업을 만들거나 다른 PC로 데이터를 옮길 수 있습니다. 로컬 폴더와 앱 경로는 새 PC 환경에 맞게 수정해야 하며, 가져온 명령은 자동으로 실행되지 않습니다.

## 개발

Junction은 React, TypeScript, Tauri 2와 Rust로 만들어졌습니다. 개발에는 Node.js 22.12 이상, Rust MSVC, Microsoft C++ Build Tools와 WebView2가 필요합니다.

```text
npm ci
npm run desktop
```

## 테스트 및 패키징

```text
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run test:e2e
npm run package
```

UI 테스트는 설치된 Microsoft Edge를 사용합니다. 브라우저 미리보기에서는 실제 폴더, 앱과 명령 실행을 차단하며, Windows 프로세스 동작은 Rust 테스트로 검증합니다.

실제 콘솔 창 유지 동작은 다음 명령으로 별도 확인할 수 있습니다. 테스트 중 PowerShell 창이 잠시 열립니다.

```text
cargo test --manifest-path src-tauri/Cargo.toml visible_console_reports_completion_and_retains_output -- --ignored --nocapture
```

## 코드 구조

| 경로                                   | 역할                                           |
| -------------------------------------- | ---------------------------------------------- |
| `src/App.tsx`, `src/styles.css`        | 프로젝트 허브와 편집 화면                      |
| `src/model.ts`, `src/persistence.ts`   | 화면 데이터 모델, 검색, 검증과 저장 순서 관리  |
| `src/api.ts`                           | Tauri IPC와 파일 선택창 연결                   |
| `src-tauri/src/model.rs`, `storage.rs` | 데이터 검증, 파일 저장과 복구                  |
| `src-tauri/src/launch.rs`              | 항목 열기, PowerShell 실행과 프로세스 종료     |
| `src-tauri/src/lib.rs`                 | IPC 명령, 앱 수명과 단일 인스턴스 관리         |
| `tests/`                               | 주요 사용자 흐름과 IPC 연결 테스트             |

## 라이선스

Junction은 [MIT License](LICENSE)로 공개합니다. 인터페이스와 앱 아이콘에는 ISC 라이선스의 [Lucide](https://lucide.dev/) 아이콘을 사용합니다.
