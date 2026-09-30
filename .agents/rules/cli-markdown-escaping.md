---
description: Rules for GitHub CLI (gh) PR descriptions and shell markdown escaping
---

# GitHub CLI & Shell Markdown Escaping Rules

## PR / Issue 本文・複数行 Markdown 送信時の `--body-file` 必須ルール

Windows / PowerShell 環境下で `gh pr create` や `gh pr edit`、`gh issue create` に `--body "..."` でインライン文字列を渡すと、バッククォート（` ` `）のエスケープによるバックスラッシュ（`\`）の残留や改行コード破損のトラブルが発生します。

これを恒久的に防止するため、以下のルールを厳格に適用します：

### 1. 複数行の本文は必ず `scratch/` 配下の一時ファイルと `--body-file` を使用する
- コマンド引数への直接インライン展開（`--body "..."`）は行わない。
- 一時ファイルは必ず `.gitignore` 対象の **`scratch/`** ディレクトリ配下（例: `scratch/pr_body.md`, `scratch/issue_body.md`）に書き出すこと。リポジトリのルート直下に一時ファイルを作成してはならない。
- `gh pr create --body-file <path>` や `gh issue create --body-file <path>` で送信すること。
- 送信完了後、一時ファイルは速やかに削除する（※ `.gitignore` 対象のため万が一残っても安全だが、整理のため削除を推奨）。

### 2. PR タイトルと本文の言語
- **本家（Upstream: Henrik-3/AntigravityQuota）への PR**:
  - タイトル・本文ともに **英語 (English)** で記述すること。
  - Conventional Commits プレフィックス（`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`）を使用すること。
  - 例: `fix: improve process finder detection on Windows`
- **個人の Fork 内 Issue / PR**:
  - 必要に応じて日本語でも可。

### 3. 作成後の自動検証
- PR 作成後は `gh pr view <number>`（Issue 作成後は `gh issue view <number>`）を実行し、本文に不要なエスケープ文字（`\`）や記号崩れがないか確認すること。
