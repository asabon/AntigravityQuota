---
description: Guidelines for running shell commands and scripts in Windows/PowerShell environment
---

# Windows / PowerShell 環境における CLI 実行ルール

Windows (PowerShell) 環境で AI コーディングエージェントがコマンドを実行する際、Linux/macOS (bash) との環境差異による失敗を防ぐため、以下のルールを遵守してください。

---

## 1. JSON の処理には外部 `jq` ではなく `gh --jq` を使用する
- **背景**: Windows 環境には `jq` コマンドが標準インストールされていない場合が多く、`| jq` はコマンド未検出エラーになります。
- **ルール**: GitHub CLI のコマンド結果から値を抽出・フィルタリングする場合は、必ず `gh` 組み込みの `--jq` フラグを使用してください。
  - ❌ 避ける: `gh api repos/:owner/:repo/releases | jq '.[] | select(.draft == true)'`
  - ✅ 推奨: `gh api repos/:owner/:repo/releases --jq '.[] | select(.draft == true)'`

---

## 2. 複雑なインライン処理・文字列操作には `node -e` を優先する
- **背景**: PowerShell（pwsh）ではバッククォート（`` ` ``）がエスケープ文字であり、引用符（`"` と `'`）の入れ子や特殊文字の扱いで構文エラーが発生しやすくなります。
- **ルール**: ファイルの正規表現置換、改行コードの一括変換、JSON の動的加工などは、OS 依存のない Node.js のワンライナー（`node -e "..."`）を使用してください。
  - 例: `node -e "const fs = require('fs'); const content = fs.readFileSync('file.md', 'utf8').replace(/\r\n/g, '\n'); fs.writeFileSync('file.md', content, 'utf8');"`

---

## 3. PR マージ後のブランチ後始末は `git fetch --prune` を基本とする
- **背景**: GitHub 側で「PR マージ時にブランチを自動削除（Automatically delete head branches）」が設定されている場合、ローカルから `git push origin --delete <branch>` を実行すると `remote ref does not exist` エラーになります。
- **ルール**: PR マージ後のブランチ整理は以下の順序で行ってください。
  ```bash
  git switch develop
  git fetch upstream --prune
  git branch -d <topic-branch>
  ```
