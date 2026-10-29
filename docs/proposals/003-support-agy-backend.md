# 003: Antigravity 新バックエンドプロセス（agy / agy.exe）の検出サポートと後方互換性維持 (Support for AGY Backend Process & Backward Compatibility)

- **作成日**: 2026-10-29
- **ステータス**: Implemented
- **対象コンポーネント**: `src/core/process_finder.ts`, `src/core/platform_strategies.ts`
- **関連 Issue / PR**:
  - 本家 Issue: [Henrik-3/AntigravityQuota#32](https://github.com/Henrik-3/AntigravityQuota/issues/32)
  - 本家 PR: [Henrik-3/AntigravityQuota#33](https://github.com/Henrik-3/AntigravityQuota/pull/33)
  - Fork PR: [asabon/AntigravityQuota#21](https://github.com/asabon/AntigravityQuota/pull/21)

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
2026年10月下旬の Antigravity IDE（v2.6.0 / VS Code base v1.107.0 等）のアップデートに伴い、バックエンド言語サーバーのバイナリおよび引数仕様が刷新されました（本家 Issue [#32](https://github.com/Henrik-3/AntigravityQuota/issues/32) にて報告）：

1. **プロセス検索が 0 件になる**:
   - **Windows**: `language_server_windows_*.exe` から `agy.exe`（`~/.gemini/bin/agy.exe`）に変更されたため、`Get-CimInstance` が空文字（`0 chars`）を返却。
   - **macOS (Apple Silicon)**: バイナリ名が `language_server_macos_arm` ではなくサフィックスなしの `language_server`（または `agy`）に変更されたため、`pgrep` が失敗。
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
`ProcessFinder` および各 OS の `platform_strategy`（Windows / Unix）を拡張し、新バイナリ `agy` / `agy.exe` および macOS の `language_server` を検出しつつ、旧環境のユーザー向けに `language_server_*` もフォールバックとして検出できるように後方互換性を担保します。

### 3.2 プロセス検出の設計

#### (1) 対象プロセス名のリスト化
プラットフォームごとに優先順位付きのプロセス名候補を定義：

| プラットフォーム | 探索対象プロセス名（優先順） |
| :--- | :--- |
| **Windows** | `agy.exe`<br>`language_server_windows_x64.exe`<br>`language_server_windows_arm.exe` |
| **macOS** | `agy`<br>`language_server`<br>`language_server_macos`<br>`language_server_macos_arm` |
| **Linux** | `agy`<br>`language_server`<br>`language_server_linux_x64`<br>`language_server_linux_arm` |

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
  LC_ALL=C pgrep -fl "(agy|language_server|language_server_macos_arm)"   # macOS
  LC_ALL=C pgrep -af "(agy|language_server|language_server_linux_x64)"  # Linux
  ```

#### (3) 複数候補の順次評価と堅牢なポート疎通確認
- `parse_process_info` は単一オブジェクトではなく、有効な候補配列（`process_candidate[]`）を返却。
- CSRF トークンを持たない候補プロセス（親プロセス等）はスキップ。
- `detect_process_info` で各候補のリッスンポートを順次評価し、ポート疎通に成功した最初の候補を採用。

---

## 4. 実装完了・モジュール別変更点 (Implementation)

- [x] **`src/core/platform_strategies.ts`**:
  - `WindowsStrategy`:
    - `get_process_list_command`: 複数プロセス名に対応する WQL フィルタの生成。
    - `is_antigravity_process`: `--app_data_dir[=\s]+[^\s]*antigravity`、パス、`agy --hub` 対応。
    - `parse_process_info`: 複数候補の抽出、`--hub-port` 対応、空文字安全処理。
  - `UnixStrategy`:
    - `get_process_list_command`: `(agy|language_server|...)` パターン対応。
    - `is_antigravity_process`: パス判定の緩和（macOS `/Applications/Antigravity.app` 等）。
    - `parse_process_info`: 複数候補の配列返却。
- [x] **`src/core/process_finder.ts`**:
  - 各 OS の対象プロセス名リスト化（`agy`, `language_server`, 旧バイナリ）。
  - 複数候補の順次ポート疎通確認ループの実装。
- [x] **単体テスト (`src/test/platform_strategies.test.ts`)**:
  - 全26パターンのテストを追加し、全て PASS。

---

## 5. 下位互換性とリスク (Backward Compatibility & Risks)

- **完全な下位互換性**:
  探索対象に従来の `language_server_*` を含めているため、古いバージョンの Antigravity IDE を利用しているユーザー環境でもそのまま動作し続けます。
- **リスクヘッジ**:
  `antigravity` の文字列チェックおよび `--csrf_token` の存在チェックにより、無関係なプロセスの誤検出を防止。

---

## 6. 本家（upstream）向け PR 情報

- **PR**: [Henrik-3/AntigravityQuota#33](https://github.com/Henrik-3/AntigravityQuota/pull/33)
- **タイトル**: `fix: support new agy backend process and argument formats (fixes #32)`
