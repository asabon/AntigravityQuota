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

## 🌿 Git & ブランチ運用ルール（最重要）

本リポジトリは **本家（`upstream`: `Henrik-3/AntigravityQuota`）にクリーンな PR を提出しつつ、手元で AI ハーネス環境を維持する** 運用を行います。

### 1. ブランチの役割
- **`develop`（作業本線・AIハーネス拠点）**:
  - ユーザーの開発本線ブランチ。この `AGENTS.md` や `.agents/` などの AI ハーネス環境が常備されています。
  - **日々の実装・調査・デバッグ・テストはすべて `develop` ブランチ上で行います。**
- **`upstream/main`（本家の追跡）**:
  - 本家の最新状態を同期するための読み取り専用ブランチ。直接コミットしてはなりません。
- **`pr/<topic-name>`（本家提出用 PR ブランチ）**:
  - 本家へ PR を出す際、**一時的に `upstream/main` から作成する専用ブランチ**。

### 2. PR 作成手順（ハーネス混入の厳格な防止）
本家への PR を作成する際は、必ず以下の手順を踏んでください：

```powershell
# 1. 本家の最新から PR 用トピックブランチを作成
git fetch upstream
git switch -c pr/fix-quota-display upstream/main

# 2. develop ブランチで作成した修正コミットのみを cherry-pick
git cherry-pick <COMMIT_HASH>

# 3. 差分検証（重要）: ハーネスファイルが含まれていないことを確認
git diff upstream/main --stat

# 4. 自分の Fork (origin) に push して本家へ PR を作成
git push -u origin pr/fix-quota-display
```

> ⚠️ **絶対遵守**:
> PR 用ブランチには、`AGENTS.md`、`.agents/`、その他ローカル用のハーネスファイルを絶対にコミット・混入させてはなりません。

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
