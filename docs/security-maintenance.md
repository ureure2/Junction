# 보안 및 자동 검증

공식 배포 대상은 Windows x64입니다. PR과 main 변경 시 GitHub Actions에서
단위 테스트, 프런트엔드 빌드, Rust 테스트, Edge UI 테스트와 Windows 앱 빌드를 실행합니다.
대화형 콘솔을 여는 ignored Rust 테스트는 기존 README의 수동 검증 절차를 따릅니다.
CI는 설치 파일 배포나 코드 서명을 수행하지 않습니다.

Dependabot은 npm, Cargo, GitHub Actions 업데이트를 매주 확인합니다.

## Dependabot 알림 #1: glib 0.18.5

2026-10-18 확인: `glib::VariantStrIter`의 Iterator/DoubleEndedIterator 구현에
관한 중간 등급 알림이며 수정 버전은 0.20.0입니다. 현재 GTK 의존 관계에서는
Dependabot이 수정 버전으로 올리지 못합니다(`security_update_not_possible`).

다음 명령으로 잠금 파일의 플랫폼별 의존성을 확인했습니다.

```text
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc -i glib
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target x86_64-unknown-linux-gnu -i glib
```

Windows x64에서는 glib 의존 경로가 없으며 Linux에서는 Tauri/Wry의 GTK 계열
의존성을 통해 glib 0.18.5가 포함됩니다. 따라서 현재 Windows 배포 범위에 한해
알림을 `not_used`로 처리합니다. 취약한 라이브러리 자체가 수정되었다는 뜻은 아닙니다.
잠금 파일의 glib 항목을 삭제하거나 호환되지 않는 버전을 강제하지 않습니다.

CI는 Windows 의존성에 glib가 새로 포함되면 실패하도록 검사합니다.
Linux 지원 추가 또는 의존성 변경으로 영향 범위가 달라지면 알림을 다시 열고
상위 라이브러리 업데이트 및 해당 API 사용 경로를 재검토해야 합니다.

- 알림: https://github.com/ureure2/Junction/security/dependabot/1
- 자동 수정 실패: https://github.com/ureure2/Junction/actions/runs/35552566216
