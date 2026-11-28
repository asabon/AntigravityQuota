# 本家（upstream）還元ロードマップ・作業引き継ぎメモ

このドキュメントは、Fork（`asabon/AntigravityQuota`）から本家（`Henrik-3/AntigravityQuota`）へ提出する PR の順番と進捗を管理するための備忘録です。  
本家メンテナーのレビュー負担とリスクが小さい順に、**1 テーマ = 1 PR** で進めます。

---

## 現在の基準状態
- **本家 (`upstream/main`)**: `v1.3.0` (`34238a2`)
- **Fork (`develop`)**: `fdd9c6d` 以降

---

## 還元ステップ一覧

### Step 1: PR #42 向けユニットテスト追加（デグレ防止テスト）
- **位置づけ**: 本家 PR #42（`v1.3.0`）で既に実装・リリース済みの機能に対する回帰防止テストの追加（プロダクションコード変更なし）。
- **対象ファイル**: `src/test/process_finder.test.ts`, `src/test/quota_manager.test.ts`
- **状態**:
  - [x] Fork `develop` へマージ済み（`fd4c16d` / Fork PR #37）
  - [x] 本家 PR 作成済み: [`Henrik-3/AntigravityQuota#47`](https://github.com/Henrik-3/AntigravityQuota/pull/47)
  - [ ] 本家でのマージ待ち
- **次のアクション**:
  - 本家 PR #47 がマージ（または反応）されたら、Step 2 の本家 PR 提出へ進む。

---

### Step 2: PR #46 の CodeRabbit 指摘修正 ＋ ユニットテスト追加
- **位置づけ**: 本家 PR #46 でマージされた `src/ui/status_bar.ts` の不具合修正とテスト追加。
  1. グループ親行トグル時のフォーカス復元（`label` ではなく `group_name` / `group_display_name` / `bucket_id` で一致判定）
  2. `ensure_display_mode` で `this.config_manager.get_config().display_mode` を参照（レガシー `agQuota.displayMode` 対応）
  3. `agq` / `agQuota` の `inspect('displayMode')` に応じて `WorkspaceFolder` / `Workspace` / `Global` のスコープを維持
- **対象ファイル**: `src/ui/status_bar.ts`, `src/test/status_bar.test.ts`
- **状態**:
  - [x] Fork `develop` へマージ済み（`fdd9c6d` / Fork PR #38、CodeRabbit 指摘 0 件・3OS CI 全パス）
  - [ ] 本家 PR 作成（Step 1 の #47 マージ後に実施予定）
- **次のアクション（本家 PR #47 マージ後）**:
  ```powershell
  git fetch upstream
  git switch -c pr/status-bar-focus-and-mode upstream/main
  git cherry-pick fdd9c6d
  git diff upstream/main --stat
  npm run compile && npm run lint && npm run test
  git push -u origin pr/status-bar-focus-and-mode
  # scratch/upstream_pr_body.md を作成して gh pr create --repo Henrik-3/AntigravityQuota ...
  ```

---

### Step 3: 3OS ネイティブ統合テストの拡充と本家還元
- **位置づけ**: Windows / Linux / macOS の実 OS コマンドを用いたプロセス・ポート検出統合テストの本家還元。
- **対象ファイル**: `src/test/process_finder_integration.test.ts`, `src/test/fixtures/mock_backend.ts`
- **状態**:
  - [x] ベース実装済み（Fork `develop` に存在）
  - [ ] `v1.3.0` 向けケース追加（`is_hub` 判定、`daemon/hub_<port>.json` 連携）
  - [ ] Fork 側 3OS CI で安定稼働を確認（`f3e8c1f` 以降のため `coderabbit-autofix.yml` の検証も兼ねる）
  - [ ] 本家へ PR 提出（CI ワークフロー変更は含めず、`src/test/` のテストコードのみに絞る）

---

## 別枠（新機能・作業中）
- **Weekly quota pace indicator**（本家 Issue [`#30`](https://github.com/Henrik-3/AntigravityQuota/issues/30) 対応）
  - Fork PR: [`asabon/AntigravityQuota#12`](https://github.com/asabon/AntigravityQuota/pull/12)（`feature/weekly-pace-indicator`）が Open 中。
  - 上記 Step 1〜3 の状況を見つつ、改めて仕上げ・同期・提出を検討する。
