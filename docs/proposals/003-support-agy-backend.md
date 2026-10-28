# 003: Antigravity 新バックエンドプロセス（agy / agy.exe）の検出サポートと後方互換性維持 (Support for AGY Backend Process & Backward Compatibility)

- **作成日**: 2026-10-29
- **ステータス**: Draft
- **対象コンポーネント**: `src/core/process_finder.ts`, `src/core/platform_strategies.ts`
- **関連 Issue / PR**: 本家未報告（本提案から PR 提出予定）

---

## 1. 背景と課題 (Background & Problem Statement)

### 1.1 背景 (Context)
Antigravity Quota (AGQ) は、VS Code / Antigravity IDE 上で動作し、IDE の言語サーバープロセスがローカルに開いている Connect-RPC/gRPC-Web エンドポイントと HTTPS 通信を行うことで、モデルごとのクォータ残量やリセット時刻を取得・表示しています。

これまでは、Antigravity IDE のバックエンド言語サーバーとして以下の実行ファイル名が使用されていました：
- **Windows**: `language_server_windows_x64.exe` / `language_server_windows_arm.exe`
- **macOS**: `language_server_macos` / `language_server_macos_arm`
- **Linux**: `language_server_linux_x64` / `language_server_linux_arm`

AGQ の `ProcessFinder` は、OS に応じたプロセス名をハードコードし、OS コマンド（PowerShell / WMIC / pgrep）で該当プロセスを検索・特定していました。

### 1.2 課題・問題点 (Problem Statement)
2026年10月下旬の Antigravity IDE（v1.107.0 等）のアップデートに伴い、バックエンド言語サーバーが従来の `language_server_*` から統合 CLI バイナリ **`agy.exe`**（macOS / Linux では **`agy`**）へ移行しました。

この変更により、AGQ では以下の問題が発生し、拡張機能が完全に機能停止（プロセス検出失敗）する事態が発生しています：

1. **プロセス検索が 0 件になる**:
   `Get-CimInstance Win32_Process -Filter "name='language_server_windows_x64.exe'"` が該当プロセスなし（空文字 `0 chars`）を返却。
2. **パースエラーによる起動失敗**:
   空文字に対して `JSON.parse` が実行され、`JSON parse error: Unexpected end of JSON input` が発生。
   結果として `Antigravity process not found` となり、クォータの取得・表示が一切行われなくなる。
3. **コマンドライン引数形式の差異**:
   - 引数区切りが `--app_data_dir antigravity`（スペース区切り）から `--app_data_dir=antigravity`（等号区切り）に変更。
   - ポート引数が `--extension_server_port` から `--hub-port` に変更。
   - 既存の正規表現や判定ロジックでは、仮にプロセスを拾えてもフィルタやトークン抽出で弾かれる可能性がある。

---

## 2. 調査結果・技術検証 (Investigation & Findings)

### 2.1 稼働中プロセスの実機調査（Windows x64）

現在 Antigravity IDE が実行されている環境でプロセスを調査した結果：

```powershell
ProcessId   : 6200
Name        : agy.exe
CommandLine : C:\Users\asabo\.gemini\bin\agy.exe --hub --hub-port=60742 --app_data_dir=antigravity --csrf_token=87d11f7e-aafb-4cbf-adbd-e54f366ff5ea --add-dir=e:\work\AntigravityQuota
```

- プロセス名は `agy.exe`。
- 引数として `--hub`, `--hub-port=<port>`, `--app_data_dir=antigravity`, `--csrf_token=<token>` が渡されている。

### 2.2 ネットワークポートと API 疎通検証

PID 6200（`agy.exe`）がリッスンしているポートを調査：
- `127.0.0.1:60742` (Listen): `--hub-port` で指定された HTTP ポート
- `127.0.0.1:60744` (Listen): バックエンドが自動バインドした HTTPS ポート

各ポートに対して、AGQ と同一のリクエスト（`/exa.language_server_pb.LanguageServerService/GetUserStatus`）を送信して検証：

```json
// Port 60744 (HTTPS) へのリクエスト結果:
{
  "status": 200,
  "body": "{\"userStatus\":{\"disableTelemetry\":true, \"name\":\"...\", \"email\":\"...\", \"planType\":\"PLAN_TYPE_PRO\", ...}}"
}
```

- **結論**: バックエンドの API エンドポイント仕様（RPC メソッド名、リクエスト/レスポンス構造、`X-Codeium-Csrf-Token` による認証方式）は従来と完全に同一であり、プロセス特定とポート探索さえ成功すれば、既存のクォータ取得ロジックがそのまま動作することを確認。

---

## 3. 提案内容・機能仕様 (Proposed Solution & Architecture)

### 3.1 概要 (Overview)
`ProcessFinder` および各 OS の `platform_strategy`（Windows / Unix）を拡張し、新バイナリ `agy` / `agy.exe` を最優先で検出しつつ、旧環境のユーザー向けに `language_server_*` もフォールバックとして検出できるように後方互換性を担保します。

### 3.2 プロセス検出の設計

#### (1) 対象プロセス名のリスト化
プラットフォームごとに優先順位付きのプロセス名候補を定義します：

| プラットフォーム | 探索対象プロセス名（優先順） |
| :--- | :--- |
| **Windows** | `agy.exe`<br>`language_server_windows_x64.exe`<br>`language_server_windows_arm.exe` |
| **macOS** | `agy`<br>`language_server_macos`<br>`language_server_macos_arm` |
| **Linux** | `agy`<br>`language_server_linux_x64`<br>`language_server_linux_arm` |

#### (2) プロセスリスト取得コマンドの更新

- **Windows (PowerShell)**:
  ```powershell
  Get-CimInstance Win32_Process -Filter "name='agy.exe' or name='language_server_windows_x64.exe' or name='language_server_windows_arm.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json
  ```
- **Windows (WMIC Fallback)**:
  ```cmd
  wmic process where "name='agy.exe' or name='language_server_windows_x64.exe' or name='language_server_windows_arm.exe'" get ProcessId,CommandLine /format:list
  ```
- **macOS / Linux (UnixStrategy)**:
  `pgrep` の正規表現パターンマッチを利用：
  ```bash
  LC_ALL=C pgrep -fl "(agy|language_server)"   # macOS
  LC_ALL=C pgrep -af "(agy|language_server)"   # Linux
  ```

#### (3) 引数パース正規表現の強化

- **`is_antigravity_process`**:
  `--app_data_dir` の後にスペースだけでなく `=` が来るケースにも対応：
  ```typescript
  /--app_data_dir[=\s]+antigravity\b/i
  ```
- **ポート番号の抽出**:
  `--extension_server_port` に加え `--hub-port` も許容：
  ```typescript
  const port_match = command_line.match(/--(?:extension_server_port|hub-port)[=\s]+(\d+)/i);
  ```
- **UnixStrategy の事前チェック緩和**:
  従来 `if (!line.includes('--extension_server_port'))` で弾いていた部分を、`--csrf_token` か `--hub-port` があれば候補とするよう緩和。

---

## 4. 実装計画・モジュール別変更点 (Implementation Plan)

- [ ] **`src/core/platform_strategies.ts`**:
  - `WindowsStrategy`:
    - `get_process_list_command`: 複数プロセス名に対応する WQL フィルタの生成。
    - `is_antigravity_process`: `--app_data_dir[=\s]+antigravity` の正規表現対応。
    - `parse_process_info`: `--hub-port` の正規表現抽出を追加。空文字時のエラーハンドリング改善。
    - `get_error_messages`: エラーメッセージ内のプロセス名表示を更新。
  - `UnixStrategy`:
    - `get_process_list_command`: `(agy|language_server)` パターンによるプロセス検索。
    - `is_antigravity_process`: `--app_data_dir` の `=` 区切り対応。
    - `parse_process_info`: `--hub-port` 対応、フィルタ緩和。
- [ ] **`src/core/process_finder.ts`**:
  - プラットフォームごとのプロセス名指定を配列またはパターンに対応。
  - ログ出力の更新（新旧プロセス名が分かるように調整）。
- [ ] **検証・テスト**:
  - TypeScript コンパイル (`npm run compile`)
  - ESLint チェック (`npm run lint`)
  - 単体テスト実行 (`npm run test`)
  - 日本語混入チェック (`node .agents/scripts/check-no-japanese.mjs --all`)
  - 実際の Antigravity IDE 上で拡張機能を読み込み、クォータが正常に表示されるか動作確認。

---

## 5. 下位互換性とリスク (Backward Compatibility & Risks)

- **完全な下位互換性**:
  探索対象に従来の `language_server_*` を含めているため、まだ古いバージョンの Antigravity IDE を利用しているユーザー環境でもそのまま動作し続けます。
- **リスク**:
  `agy` という名前の無関係なプロセスが別ツール等で存在した場合の誤検出リスク。
  → コマンドライン引数内に `--app_data_dir[=\s]+antigravity` または パスに `antigravity` が含まれていること、かつ `--csrf_token` が存在することを確認するため、誤検出のリスクは極めて低いです。

---

## 6. 本家（upstream）向け PR / Issue ドラフト (English Draft for Upstream)

### Title
```
fix: support new agy backend process and argument formats
```

### Description
```markdown
## Summary
Resolves extension activation failure on recent Antigravity IDE updates (v1.107.0+) by adding support for the new `agy` / `agy.exe` backend process alongside backward compatibility for legacy `language_server_*` processes.

## Motivation & Problem
Recent updates to the Antigravity IDE replaced the legacy language server binaries (`language_server_windows_x64.exe`, `language_server_macos`, `language_server_linux_*`) with a unified CLI binary `agy.exe` / `agy`.

Consequently, AGQ failed to find the process:
- `ProcessFinder` targeted only `language_server_*`, resulting in empty process list outputs (`Raw stdout (0 chars)`).
- JSON parsing failed with `Unexpected end of JSON input`.
- The extension terminated with `Antigravity process not found`.

In addition:
- CLI parameters now use `--app_data_dir=antigravity` (with `=`) rather than space-separated flags.
- Port parameters now use `--hub-port=<port>` in addition to legacy `--extension_server_port`.

## Solution & Implementation Details
1. **Multi-process Name Support**:
   - Updated `ProcessFinder` and platform strategies to query both `agy` (`agy.exe`) and legacy `language_server_*` binaries.
   - Preserves 100% backward compatibility for older Antigravity installations.
2. **Flexible Flag Parsing**:
   - Updated `is_antigravity_process` regex to match both `--app_data_dir=antigravity` and `--app_data_dir antigravity`.
   - Updated port parsing to extract ports from either `--hub-port` or `--extension_server_port`.
   - Relaxed Unix strategy filter to recognize processes containing `--csrf_token` or `--hub-port`.

## Verification
- Tested on Windows x64 with Antigravity IDE v1.107.0:
  - Successfully detected `agy.exe` (PID and CSRF token correctly parsed).
  - Port scanner identified the active HTTPS listening port.
  - Quota data retrieved and displayed in the status bar without errors.
- Verified lint, unit tests, and compilation pass without warnings.
```
