# Junction

Windows용 소형 프로젝트 런처. 프로젝트에 폴더, 웹 링크, 로컬 앱, 터미널 위치, 명령어와 자유메모를 모읍니다.

## 설치 및 사용

Windows 10/11 x64용 설치 파일은 [GitHub Releases](https://github.com/ureure2/Junction/releases)에서 내려받을 수 있습니다. 현재 설치 파일은 개인 코드 서명이 적용되지 않았습니다.

1. 설치 파일을 실행하고 Junction을 엽니다. 현재 사용자용으로 설치됩니다.
2. 프로젝트를 만들고 기본 작업 폴더를 지정합니다.
3. **항목 추가**에서 폴더, 웹 링크, 로컬 앱, 터미널 위치, 터미널 명령어를 등록합니다.
4. 항목 이름을 누르면 열립니다. 왼쪽 핸들을 드래그하거나 `…` 메뉴를 사용해 순서를 변경합니다.
5. 하단 **메모** 버튼을 눌러 다음 할 일이나 명령어를 적습니다. 자동 저장되며, 아래 저장 표시를 확인할 수 있습니다.

기본 창은 420×520, 최소 360×420입니다. 상단에서 프로젝트를 선택하고, `⋯` 메뉴에서 프로젝트와 실행 기록, 데이터를 관리합니다. 메모는 기본적으로 접혀 있고 프로젝트를 전환하면 다시 접힙니다.

Notion과 GitHub는 웹 주소로 등록합니다. 로컬 앱은 `.exe` 또는 `.lnk` 파일을 선택합니다. 프로젝트와 항목은 이름·경로·명령어로 검색할 수 있습니다.

## 터미널 명령어

- **이름, 실행 위치, 명령어**만 입력합니다. 실행 위치를 비워 두면 프로젝트 기본 폴더를 따릅니다.
- PATH에서 PowerShell 7(`pwsh.exe`)을 찾고, 없으면 Windows PowerShell을 사용합니다. 셸 변경·환경 변수 등 고급 설정은 없습니다.
- 별도 PowerShell 창에서 실행하므로 입력이 필요한 명령도 터미널에서 직접 조작할 수 있습니다. 명령이 끝나도 창은 유지됩니다.
- **실행해 보기**는 실제 실행입니다. 저장하지 않고 편집 창을 닫아도 상단 메뉴의 **실행 관리**에서 상태를 확인하고 종료할 수 있습니다.
- 상태는 **실행 중 / 완료 / 실패 / 종료됨**으로 표시하며, 정상 종료 코드는 0입니다. 현재 세션의 최근 종료 기록 100개와 열린 실행을 보관합니다.
- 같은 항목의 중복 실행을 막습니다. 명령 완료 후 **터미널 닫기**를 누르면 남은 창을 닫습니다.
- **종료**는 해당 실행의 Windows Job Object에 속한 프로세스를 강제 종료합니다. 다른 앱에서 시작한 동명의 프로세스는 검색하거나 종료하지 않습니다.
- Junction을 닫을 때 열린 명령 창이 있으면 확인 후 함께 종료합니다. 비정상 종료 시에도 Job 핸들이 닫히면 해당 그룹이 종료됩니다.
- ‘터미널 위치’로 연 일반 터미널과 ‘로컬 앱’ 항목은 관리 대상이 아닙니다. Docker 서비스·WSL 내부 작업·원격 작업처럼 외부 서비스에 위임한 작업은 별도로 관리해야 합니다.

## 저장과 백업

- 실제 저장 위치: `%APPDATA%\\com.junction.desktop` (앱의 **데이터 및 앱 정보**에서도 확인 가능).
- `workspace.json`: 프로젝트·항목·메모. 임시 파일 기록과 동기화 후 원자적으로 교체합니다.
- `workspace.backup.json`: 직전 정상 저장본. 원본 손상 시 자동 복구하고 화면에 안내합니다. 둘 다 읽을 수 없으면 기존 파일을 덮어쓰지 않습니다.
- 가져오기는 버전·필드·중복 ID를 확인하고 사용자의 확인 후 목록 전체를 교체합니다. 명령은 자동 실행하지 않습니다.
- JSON 내보내기로 별도 백업을 만들 수 있습니다. PC를 옮길 경우 로컬 경로는 새 PC에 맞게 수정해야 합니다.
- 실행 기록과 프로세스 핸들은 재시작 후 이어받지 않습니다. 등록된 명령을 시작 시 자동 실행하지 않습니다.

## 개발

Node.js 22.12 이상, Rust MSVC, Microsoft C++ Build Tools, WebView2가 필요합니다. 구현은 React + TypeScript / Tauri 2 + Rust입니다.

```text
npm ci
npm run desktop
```

## 검증과 패키징

```text
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run test:e2e
npm run package
```

UI 테스트는 설치된 Microsoft Edge를 사용합니다. 브라우저 미리보기에서 실제 실행은 차단됩니다. `desktop-bridge.spec.ts`는 IPC를 모의하고, 실제 Windows 프로세스 동작은 Rust 테스트로 검증합니다.

실제 콘솔 창 유지 테스트는 창이 잠시 열리므로 별도로 실행합니다.

```text
cargo test --manifest-path src-tauri/Cargo.toml visible_console_reports_completion_and_retains_output -- --ignored --nocapture
```

네이티브 UI 검증 시 디버그 빌드에서만 `JUNCTION_TEST_DATA_DIR`로 데이터를 분리할 수 있습니다. 릴리스 빌드는 이 환경 변수를 무시합니다.

## 코드 구조

| 경로                                   | 역할                                           |
| -------------------------------------- | ---------------------------------------------- |
| `src/App.tsx`, `src/styles.css`        | 프로젝트 허브와 편집 화면                      |
| `src/model.ts`, `src/persistence.ts`   | 화면 데이터 모델·검색·검증·저장 순서 관리      |
| `src/api.ts`                           | Tauri IPC 및 파일 선택창 연결                  |
| `src-tauri/src/model.rs`, `storage.rs` | 데이터 검증·파일 저장·복구                     |
| `src-tauri/src/launch.rs`              | 항목 열기·PowerShell 실행·Job Object 추적·종료 |
| `src-tauri/src/lib.rs`                 | IPC 명령·앱 수명·단일 인스턴스                 |
| `tests/`                               | 사용자 흐름과 IPC 연결 테스트                  |

트레이, 전역 단축키, 묶음 실행, 클라우드 동기화는 후속 범위입니다.

## 라이선스

Junction은 [MIT License](LICENSE)로 공개합니다. 인터페이스와 앱 아이콘에는 ISC 라이선스의 [Lucide](https://lucide.dev/) 아이콘을 사용합니다.
