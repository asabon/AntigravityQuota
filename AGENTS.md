# AI コーディングエージェント開発ガイドライン (`AGENTS.md`)

このリポジトリは、Antigravity IDE (VS Code ベース) 向けにモデル使用量・クォータ（Quota）をステータスバー等に表示する拡張機能 **Antigravity Quota (AGQ)** の Fork です。

本リポジトリで作業するすべての AI コーディングエージェント（Antigravity, Cursor, Claude Code, GitHub Copilot 等）は、以下のルールとアーキテクチャ設計を厳守してください。

---

## 🏗️ プロジェクトアーキテクチャ & モジュール構成

拡張機能の主要コードは `src/` 配下に配置されています。

- **`src/extension.ts`**:
  - VS Code 拡張のエントリーポイント (`activate`, `deactivate`)。
  - コマンド登録 (`agq.refresh`, `agq.reconnect`, `agq.show_logs`) および定期ポーリングタイマーを管理。
- **`src/core/platform_strategies.ts`**:
  - OS 別（Windows, macOS, Linux）のプロセス探索・特定ロジック。
  - Antigravity IDE の言語サーバープロセス（例: `language_server_windows_x64.exe`）を検出。
- **`src/core/process_finder.ts`**:
  - プロセス検索のオーケストレーション。該当プロセスのローカルリッスンポートを特定。
- **`src/core/quota_manager.ts`**:
  - 特定したポートと通信し、クォータ情報（モデル別の残量、リセット時刻など）を取得・キャッシュ・管理。
- **`src/core/config_manager.ts`**:
  - VS Code 設定（`agq.enabled`, `agq.pollingInterval`, `agq.pinnedModels`, `agq.showPromptCredits`）の読み込みと変更監視。
- **`src/ui/status_bar.ts`**:
  - VS Code ステータスバー項目の描画・更新、クリック時メニューの生成。
- **`src/utils/`**:
  - `logger.ts`: OutputChannel へのログ出力。
  - `types.ts`: QuotaResponse などの型定義。

---

## 🌐 言語方針（日本語と英語の使い分け）

本リポジトリは英語圏のプロジェクトを Fork していますが、開発者の思考・作業効率を最優先するため、以下のように明確な境界線を設けて使い分けます。

- **日本語を使用する領域**:
  - AI エージェントとの対話・指示・相談
  - ローカルメモ、作業記録、設計検討 (`AGENTS.md`, `.agents/`, `scratch/` 内のファイル)
  - `feature` ブランチでの日々の作業（WIP コミットメッセージなど）
- **英語を使用する領域**:
  - `src/` 配下のソースコード内のコメント・Docstring
  - Squash & Merge 時の最終コミットメッセージ (Conventional Commits 形式)
  - upstream（本家）向け Pull Request のタイトルおよび本文

> 💡 **AI エージェントへの指示**:
> ユーザーからの指示が日本語であっても、`src/` 配下のコードコメントや本家提出用の PR 本文・コミットメッセージを作成する際は、AI が責任を持って自然な英語に翻訳・作成してください。

---

## 🌿 Git & ブランチ運用ルール（最重要）

本リポジトリは **本家（`upstream`: `Henrik-3/AntigravityQuota`）にクリーンな PR を提出しつつ、手元で AI ハーネス環境を維持する** 運用を行います。

### 1. ブランチの役割
- **`develop`（保護・統合本線ブランチ）**:
  - 開発のベースラインとなる保護ブランチ。`AGENTS.md` や `.agents/` などの AI ハーネス環境が常備されています。
  - ⚠️ **`develop` への直接 commit / push は禁止**。必ず `feature/` ブランチから PR を作成し、**Squash & Merge** でマージします。
- **`feature/<topic-name>`（機能開発・作業ブランチ）**:
  - `develop` から分岐して日々の作業を行うトピックブランチ。実装、デバッグ、テスト、WIP コミットはすべてここで行います。
  - 作業完了後、`develop` 宛てに PR を作成し、Squash & Merge します。
- **`upstream/main`（本家の追跡）**:
  - 本家の最新状態を同期するための読み取り専用ブランチ。直接コミットしてはなりません。
- **`origin/main`（Fork の main / 本家ミラー）**:
  - Fork 先リポジトリの main ブランチ。`upstream/main` のクリーンなコピー（保管・GitHub 表示用）とし、直接のコミットや開発作業は行いません。
- **`pr/<topic-name>`（本家提出用 PR ブランチ）**:
  - 本家へ PR を出す際、**一時的に `upstream/main` から作成する専用ブランチ**。`develop` に Squash & Merge された 1 コミットのみを cherry-pick して作成します。

### 2. コミット・ブランチ分離の原則（ハーネス混入の厳格防止）
Squash & Merge を行うと、feature ブランチ内の全コミットが 1 つに統合されます。
そのため、以下の原則を厳守してください：

- **本家還元コード**（`src/` 配下などの修正）と **ローカルハーネス**（`AGENTS.md`, `.agents/` 等）の変更は、**同一 PR で混ぜずにブランチを分ける**こと。
  - 理由: ハーネス変更が混ざったまま Squash されると、本家向け PR ブランチへの cherry-pick 時に手作業でハーネスファイルを除外・修正する手間が発生します。

### 3. 日常の開発・マージフロー（feature → develop）

AI エージェントとユーザーの役割分担：
- 🤖 **AI エージェントの担当**: ブランチ作成 〜 実装 〜 検証 〜 PR 作成まで。**マージは行わず、ユーザーに PR URL を報告してレビューを依頼する**こと。
- 👤 **ユーザーの担当**: PR の差分や CI 結果を確認し、**ユーザー自身が GitHub 上で Squash & Merge（または `gh pr merge`）を実行**する。

```powershell
# --- [AI の作業範囲] ---
# 1. develop から feature ブランチを作成
git switch develop
git pull origin develop
git switch -c feature/<topic-name>

# 2. 実装・検証（WIP コミット等は自由に行って OK）
npm run compile
npm run lint
node .agents/scripts/check-no-japanese.mjs --all
git commit -m "..."

# 3. origin へ push して develop 宛てに PR 作成
git push -u origin feature/<topic-name>
# (PR 本文を scratch/pr_body.md に用意)
gh pr create --repo asabon/AntigravityQuota --base develop --head feature/<topic-name> --body-file scratch/pr_body.md
# ※ PR 作成後、ユーザーに PR の URL を報告して停止する（AI による自動マージは禁止）。

# --- [ユーザーの作業範囲] ---
# 4. ユーザーが GitHub 上で差分・CI を確認し、Squash & Merge を実行
# （CLI で行う場合: gh pr merge <PR番号> --repo asabon/AntigravityQuota --squash --delete-branch）

# 5. マージ完了後、ローカルの develop を最新化し、作業ブランチを削除
git switch develop
git pull origin develop
git branch -d feature/<topic-name>
```

### 4. 本家（upstream）への PR 作成手順
`develop` に Squash & Merge されたクリーンな 1 コミットのみを cherry-pick します：

```powershell
# 1. 本家の最新から PR 用トピックブランチを作成
git fetch upstream
git switch -c pr/<topic-name> upstream/main

# 2. develop ブランチの該当コミット（Squash された 1 コミット）を cherry-pick
git log -n 5 develop --oneline
git cherry-pick <COMMIT_HASH>

# 3. 差分検証（重要）: ハーネスファイルが含まれていないことを確認
git diff upstream/main --stat

# 4. 自分の Fork (origin) に push して本家へ PR を作成
git push -u origin pr/<topic-name>
# (PR 本文を scratch/upstream_pr_body.md に用意)
gh pr create --repo Henrik-3/AntigravityQuota --base main --head asabon:pr/<topic-name> --body-file scratch/upstream_pr_body.md
```

> ⚠️ **絶対遵守**:
> PR 用ブランチには、`AGENTS.md`、`.agents/`、`.github/workflows/check-no-japanese.yml`、その他ローカル用のハーネスファイルを絶対にコミット・混入させてはなりません。

---

## 🛠️ ビルド & 検証コマンド

コード変更を行った後は、必ず以下の検証コマンドを実行してエラーがないことを確認してください。

- **TypeScript コンパイル**:
  ```powershell
  npm run compile
  ```
- **Lint チェック**:
  ```powershell
  npm run lint
  ```
- **日本語混入チェック (`src/` 配下)**:
  ```powershell
  node .agents/scripts/check-no-japanese.mjs --all
  ```
- **拡張機能パッケージング確認（必要時）**:
  ```powershell
  npm run node:vsix:package
  ```

---

## 📋 Pull Request & CLI ルール

GitHub CLI (`gh`) を使用して PR を作成・編集する場合は、以下のルールを守ってください：

1. **本家（upstream）への PR は英語で記述**:
   - タイトルは Conventional Commits 形式（例: `fix: improve process finder detection on Windows`）。
   - 本文も英語で、変更理由・修正内容・動作確認結果を簡潔に記述する。
2. **`--body-file` の使用必須**:
   - PowerShell のエスケープ事故（バッククォートの消失やバックスラッシュ残留）を防ぐため、インライン `--body "..."` は使用禁止。
   - 必ず `scratch/pr_body.md` に本文を一時保存し、`gh pr create --body-file scratch/pr_body.md` で送信すること。
   - 送信後は `scratch/pr_body.md` を削除すること。
3. **ルール詳細**:
   - [`.agents/rules/cli-markdown-escaping.md`](.agents/rules/cli-markdown-escaping.md)
   - [`.agents/rules/windows-shell-commands.md`](.agents/rules/windows-shell-commands.md)
