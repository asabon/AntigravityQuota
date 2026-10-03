---
name: feature-proposal
description: Workflow and guidelines for creating structured feature proposals, RFCs, and upstream PR drafts in docs/proposals/ before coding.
---

# Feature Proposal Workflow Skill

このスキルは、Antigravity Quota (AGQ) において新機能や大きな仕様変更を提案・設計する際に、コード変更に着手する前に行う**設計提案書（Proposal）の作成と 2 段階ブランチ運用手順**を定義します。

---

## 🎯 目的
1. **実装前の手戻り防止**: 背景・課題・API調査・UI設計・影響範囲を事前に関係者（ユーザーとAIエージェント）ですり合わせる。
2. **本家（upstream）への還元準備**: 最初から本家（`Henrik-3/AntigravityQuota`）への PR 提出を見据え、英語の Motivation / Changes / Verification ドラフトを用意する。
3. **コミット・ブランチ分離の担保**: ドキュメントと実装コードを別ブランチで先行マージし、本家提出用 PR への cherry-pick 事故を 100% 防止する。

---

## 📋 提案・実装の標準 2 段階ワークフロー

### 【Phase 1: ドキュメントの先行作成・合意・マージ】

#### Step 1: 提案用ブランチの作成
コード実装用ブランチ（`feature/*`）ではなく、ドキュメント専用ブランチを作成します：
```powershell
git switch develop
git pull origin develop
git switch -c docs/<topic-name>
```

#### Step 2: 既存の提案書と連番の確認
`docs/proposals/` 内の一覧を確認し、次に使用すべき連番（例: `001`, `002`, `003`...）を決定します。

#### Step 3: テンプレートからのドラフト作成
[docs/proposals/TEMPLATE.md](file:///e:/work/AntigravityQuota/docs/proposals/TEMPLATE.md) をコピーし、`docs/proposals/XXX-<topic-name>.md` を作成して各セクションを記述します。
- 背景と課題
- 技術調査・API レスポンス（エビデンス）
- UI/UX 仕様（プラン差分への動的適応含む）
- 実装計画チェックリスト
- 本家向け PR ドラフト（英語）

#### Step 4: ユーザーレビューと develop への先行マージ
1. ユーザーに提案内容を提示し、仕様の合意を得る。
2. `docs/<topic-name>` を push して `develop` 宛てに PR 作成。
3. ユーザーが GitHub 上で **Squash & Merge** を実行。
4. これにより、**提案書が先行して develop に確定・保存**されます。

---

### 【Phase 2: 本家還元コードの実装】

#### Step 5: 実装ブランチの作成
最新化された `develop` から実装ブランチを分岐します：
```powershell
git switch develop
git pull origin develop
git switch -c feature/<topic-name>
```

#### Step 6: 実装と検証
- `src/` 配下および `package.json` のみを変更します（`docs/` や `.agents/` は変更しない）。
- 検証コマンドを実行：
  ```powershell
  npm run compile
  node .agents/scripts/check-no-japanese.mjs --all
  ```

#### Step 7: develop へのマージ（純粋な 1 コミットの生成）
- `feature/<topic-name>` を push して `develop` 宛てに PR 作成。
- ユーザーが GitHub 上で **Squash & Merge** を実行。
- **効果**: `develop` 上に「本家に還元するコード（`src/` 等）のみを含んだクリーンな 1 コミット」が生成されます。

---

### 【Phase 2.5: ドキュメントの事後同期（実装中の仕様変更・乖離の反映）】

> ⚠️ **注意**: 実装中に仕様変更が発生しても、`feature/` ブランチ内で `docs/` を触ってはなりません（混入事故の原因）。

#### Step 8: ドキュメント同期ブランチの作成と反映
実装マージ完了後、ドキュメントの事後同期を行います：
```powershell
git switch develop
git pull origin develop
git switch -c docs/sync-<topic-name>

# 1. 提案書 (docs/proposals/XXX.md) を実際の実装に合わせて更新し、ステータスを Implemented に変更
# 2. 必要に応じて docs/SPECIFICATION_JA.md（全体仕様書）も最新化
git commit -m "docs: sync proposal XXX with final implementation"
git push -u origin docs/sync-<topic-name>
# (develop 宛てに PR を作成し、Squash & Merge)
```

---

### 【Phase 3: 本家への PR 提出】

#### Step 9: cherry-pick によるクリーンな PR 作成
```powershell
git fetch upstream
git switch -c pr/<topic-name> upstream/main
git cherry-pick <Phase 2 の SQUASH_COMMIT_HASH>
git diff upstream/main --stat   # docs/ や .agents/ が含まれていないことを確認
git push -u origin pr/<topic-name>
# (提案書内の英語ドラフトを使って本家へ PR 作成)
```

---

### 【Phase 4: 本家判定後のリカバリー（不採用時）】

#### Step 10: develop 上での Revert と提案書のクローズ
万が一本家で PR が見送り（Reject）になった場合、手元の `develop` をクリーンにして次の機能に進みます：
```powershell
git switch develop
git pull origin develop

# Phase 2 の Squash コミットを Revert（ハーネスはそのまま残り、コードのみが本家同期に戻る）
git revert <Phase 2 の SQUASH_COMMIT_HASH>
git push origin develop

# 提案書 (docs/proposals/XXX.md) のステータスを Closed に更新
```
