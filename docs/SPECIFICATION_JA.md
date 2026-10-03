# Antigravity Quota (AGQ) 機能仕様書

本ドキュメントは、VS Code / Antigravity IDE 向け拡張機能 **Antigravity Quota (AGQ)** の機能概要および内部仕様を日本語でまとめたものです。

---

## 1. プロジェクト概要

### 1.1 目的
Antigravity IDE（VS Code ベース）上で利用可能な AI モデル（Gemini、Claude、GPT など）の**利用枠（Quota / クォータ）残量およびリセット時間**を、バックグラウンドで自動監視し、エディタのステータスバーやメニューにリアルタイム表示する軽量な拡張機能です。

### 1.2 主な特徴
- **完全自動検出**: ユーザーが API キーやポート番号を設定する必要なく、ローカルで起動中の Antigravity 言語サーバープロセスを自動探索して接続。
- **マルチプラットフォーム対応**: Windows（PowerShell / WMIC）、macOS（pgrep / lsof）、Linux（pgrep / ss）に対応。
- **ステータスバー常駐**: お好みのモデルをピン留めし、残量パーセンテージとステータス（健全・警告・枯渇）を一目で確認可能。
- **対話型クイックピックメニュー**: ワンクリックで全モデルの残量バー（`▓▓▓▓▓░░░░░`）やリセットまでのカウントダウンを表示し、ピン留めのオン/オフを切り替え可能。
- **自動復旧・再接続**: IDE 再起動や言語サーバーの再起動を検知し、自動で再接続を試行。

---

## 2. アーキテクチャと動作メカニズム

拡張機能は外部インターネットの特定サーバーではなく、**ローカルマシン上で稼働している Antigravity IDE のバックエンドプロセス（言語サーバー）** と通信して情報を取得します。

```
┌────────────────────────────────────────────────────────┐
│                   VS Code / Antigravity                │
│                                                        │
│  ┌───────────────────────┐    ┌─────────────────────┐  │
│  │     StatusBarItem     │    │  QuickPick (Menu)   │  │
│  └───────────▲───────────┘    └──────────▲──────────┘  │
│              │                           │             │
│  ┌───────────┴───────────────────────────┴──────────┐  │
│  │              StatusBarManager                    │  │
│  └──────────────────────▲───────────────────────────┘  │
│                         │ on_update / on_error         │
│  ┌──────────────────────┴───────────────────────────┐  │
│  │                QuotaManager                      │  │
│  │     - HTTPS Request (Connect-Protocol)           │  │
│  │     - Periodic Polling Timer                     │  │
│  └───────────▲──────────────────────────────────────┘  │
│              │ connect_port, csrf_token                │
│  ┌───────────┴──────────────────────────────────────┐  │
│  │                ProcessFinder                     │  │
│  │  - WindowsStrategy / UnixStrategy                │  │
│  │  - Port Scan & Health Check (GetUnleashData)     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────┘
                          │ HTTPS (127.0.0.1:<connect_port>)
                          │ Header: X-Codeium-Csrf-Token
                          ▼
┌────────────────────────────────────────────────────────┐
│  Antigravity Language Server Process                   │
│  (e.g., language_server_windows_x64.exe)               │
│                                                        │
│  Endpoint: /exa.language_server_pb.LanguageServer...   │
│            /GetUserStatus                              │
└────────────────────────────────────────────────────────┘
```

### 2.1 動作ステップの詳細

1. **プロセス探索 (`ProcessFinder` & `PlatformStrategies`)**:
   - OS ごとにターゲットプロセス（例: `language_server_windows_x64.exe`, `language_server_macos`）をコマンドで検索。
   - プロセスの起動引数から以下を特定・抽出：
     - `--app_data_dir antigravity` またはパス文字列による Antigravity 専用プロセスの判別
     - `--csrf_token <UUID>`: 認証用 CSRF トークン
     - `--extension_server_port <PORT>`: 拡張サーバーポート
2. **待受ポートの特定 & ヘルスチェック (`ProcessFinder`)**:
   - プロセス ID (PID) がリッスンしているローカルポートを列挙（Windows: `Get-NetTCPConnection` / `netstat`、Unix: `lsof` / `ss`）。
   - 各ポートに対して `/exa.language_server_pb.LanguageServerService/GetUnleashData` へ HTTPS POST を行い、HTTP 200 かつ有効な JSON を返すポート（`connect_port`）を特定。
3. **クォータ情報の取得 (`QuotaManager`)**:
   - `connect_port` に対して `/exa.language_server_pb.LanguageServerService/GetUserStatus` を POST リクエスト。
   - レスポンス内の `userStatus.cascadeModelConfigData.clientModelConfigs` から各モデルのクォータ情報（`remainingFraction`, `resetTime`）を抽出・計算。
4. **表示の更新 (`StatusBarManager`)**:
   - クォータスナップショットを受け取り、ピン留めされたモデルをステータスバーに描画。
   - ユーザーがクリックした際は詳細メニュー（QuickPick）を構築。

---

## 3. 提供機能一覧

### 3.1 リアルタイム・定期クォータ監視
- **自動ポーリング**: 設定されたインターバル（デフォルト: 120 秒、最小: 30 秒）ごとに自動で最新クォータを取得。
- **手動更新**: コマンドパレットやショートカットから即時更新可能。
- **自動再接続機能**: クォータ取得が連続 3 回失敗した場合、プロセス・ポートの再探索および再接続を自動実行。

### 3.2 ステータスバー表示
- **モデル別インジケーター**:
  - `$(check)`: クォータ残量 20% 超（正常）
  - `$(warning)`: クォータ残量 20% 未満（警告）
  - `$(error)`: クォータ残量 0%（枯渇）
- **モデル短縮表記**:
  ステータスバーの表示幅を抑えるため、モデル名を自動短縮（例: `Gemini 3.5 Flash (Medium)` → `G3.5F(M)`、`Claude Sonnet 4.6 (Thinking)` → `Claude S4.6T`）。
- **デフォルト表示**: ピン留めモデルがない場合は `$(rocket) AGQ` を表示。
- **初期化・エラー状態**: 初期化中は `$(sync~spin) AGQ`、エラー時は `$(error) AGQ`（ツールチップにエラー詳細を表示）。

### 3.3 対話型クイックピックメニュー
ステータスバーをクリックするか、コマンド `agq.show_menu` を実行すると一覧メニューが表示されます。
- **プログレスバー表示**: 残量を 10 段階のバー（例: `▓▓▓▓▓░░░░░ 50.0%`）で視覚化。
- **リセット予測時間**: 各モデルがリセットされるまでの残り時間（例: `Resets in: 2h 15m (03/10/2026 18:00)`）を表示。
- **ピン留めトグル**:
  メニュー内のモデル項目をクリックすると、ステータスバーへのピン留め（表示 / 非表示）を即座にトグル切り替え可能（設定 `agq.pinnedModels` が自動更新されます）。

### 3.4 コマンド一覧

| コマンド ID | タイトル | 説明 |
| :--- | :--- | :--- |
| `agq.refresh` | **AGQ: Refresh Now** | クォータ情報を手動で即時再取得します。 |
| `agq.reconnect` | **AGQ: Reconnect** | 言語サーバープロセスの再探索および再接続を行います。 |
| `agq.show_logs` | **AGQ: Show Debug Log** | 「Output」パネル内の詳細デバッグログを表示します。 |
| `agq.activate` | *(内部コマンド)* | 手動アクティベーション用。 |
| `agq.show_menu` | *(内部コマンド)* | ステータスバークリック時にメニューを表示します。 |

### 3.5 設定項目 (`settings.json`)

| 設定キー | 型 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| `agq.enabled` | `boolean` | `true` | クォータの自動監視を行うかどうか。 |
| `agq.pollingInterval` | `number` | `120` | ポーリング間隔（秒）。最小値は 30 秒（推奨: 120 秒以上）。 |
| `agq.pinnedModels` | `string[]` | `[]` | ステータスバーに常時表示するモデル ID の配列。空の場合は `AGQ` と表示。 |
| `agq.showPromptCredits` | `boolean` | `false` | プロンプトクレジットの表示（将来機能・準備中）。 |

---

## 4. プロジェクト構成と役割

```
AntigravityQuota/
├── .agents/                    # AI ハーネス、ルール、スクリプト（ローカル専用）
│   └── scripts/
│       └── check-no-japanese.mjs  # src/ 配下の日本語混入防止チェック
├── AGENTS.md                   # AI エージェント用開発ガイドライン（ブランチ運用規約など）
├── assets/                     # アイコン、README 用画像
├── docs/                       # ドキュメントディレクトリ（本仕様書など）
│   └── SPECIFICATION_JA.md
├── src/                        # 拡張機能ソースコード（英語記述必須）
│   ├── extension.ts            # エントリーポイント、コマンド登録、ライフサイクル管理
│   ├── core/
│   │   ├── config_manager.ts   # VS Code 設定（agq.*）の読み込みと変更監視
│   │   ├── platform_strategies.ts # OS 別のプロセス・ポート探索戦略 (Windows / Unix)
│   │   ├── process_finder.ts   # プロセス特定とヘルスチェックによる通信ポート探索
│   │   └── quota_manager.ts    # 言語サーバーとの HTTPS 通信、クォータ解析、ポーリング
│   ├── ui/
│   │   └── status_bar.ts       # ステータスバー項目の描画・更新、QuickPick メニュー制御
│   └── utils/
│       ├── logger.ts           # OutputChannel へのログ出力管理
│       └── types.ts            # レスポンスやスナップショット等の TypeScript 型定義
├── package.json                # 拡張機能マニフェスト、設定・コマンド定義
└── tsconfig.json               # TypeScript コンパイル設定
```

---

## 5. ドキュメント配置とリポジトリ運用に関する留意事項

本リポジトリは本家（`Henrik-3/AntigravityQuota`）の Fork であり、**将来的に本家へ Pull Request を提出する** 運用を行います。

- **`docs/` に日本語ドキュメントを配置する理由**:
  - 一般的なプロジェクト構造として見通しが良く、開発者や利用者が仕様を素早く参照できるため。
- **Git 運用上の注意（重要）**:
  - 本家（upstream）へ PR を作成する際は、`upstream/main` から作成した `pr/<topic-name>` ブランチに、`src/` 配下のソースコード変更のみを cherry-pick します。
  - 本仕様書（`docs/SPECIFICATION_JA.md`）を含む日本語ドキュメントやハーネス環境（`AGENTS.md`, `.agents/`）は、本家向け PR には含めず、自身の `develop` ブランチでのみ管理します。
  - なお、CI の日本語検査スクリプト（`check-no-japanese.mjs`）は `src/` 配下のみを対象としているため、`docs/` 配下の日本語ファイルは CI エラーにはなりません。
