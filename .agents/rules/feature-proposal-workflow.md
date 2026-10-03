# 新機能・仕様変更の事前文書化ルール (`feature-proposal-workflow.md`)

新機能の実装や大幅な仕様変更を行う際は、手戻りを防止し本家（upstream）への PR 提出をスムーズに行うため、**コード実装前に必ず `docs/proposals/` 配下に設計提案書を作成し、ユーザーと合意形成を行う** 必要があります。

---

## 1. 提案書作成の義務付け

以下のいずれかに該当する場合は、コードを変更する前に提案書（Proposal）を作成してください：
- 新しい API エンドポイントや内部通信の追加・変更
- ステータスバーやメニューなど、ユーザー向け UI/UX の拡張や変更
- 新しい VS Code 設定（`package.json` の `configuration`）の追加
- 複数モジュールにまたがるアーキテクチャの変更

※ 単純なバグ修正、タイポ修正、ドキュメント修正などは提案書の作成を省略できます。

---

## 2. 提案書（Proposal）の配置と命名規則

- **配置場所**: `docs/proposals/`
- **命名規則**: `docs/proposals/XXX-<topic-name>.md`
  - `XXX`: 3桁の連番（例: `001`, `002`, ...）
  - `<topic-name>`: 英語ケバブケース（例: `quota-groups-5h-weekly`）
- **テンプレート**: `docs/proposals/TEMPLATE.md` をベースに作成する。

---

## 3. 提案書に必須の項目

1. **背景と課題**: 現状の動作と、なぜこの変更が必要なのかの理由。
2. **調査結果・技術検証**: 実際に検証した API やデータ構造、レスポンス JSON のエビデンス。
3. **提案内容・仕様**: データフロー、UI モックアップ、プラン差異への動的適応設計、新規設定キーの定義。
4. **実装計画**: モジュール別のチェックリスト。
5. **下位互換性・リスク**: 既存ユーザーへの影響とフォールバック設計。
6. **本家（upstream）向け PR / Issue ドラフト**: 英語で記述した PR 本文のドラフト。

---

## 4. 🌿 ブランチ分離の鉄則（2段階ブランチ運用）

**【重要】ドキュメントと実装コードを同一のブランチ・PR に混ぜてはなりません。**

Squash & Merge を行うとブランチ内の全変更が 1 コミットに統合されます。もし提案書（`docs/`）と実装コード（`src/`）が混ざったまま Squash されると、本家 PR 提出時に日本語ドキュメントを cherry-pick から手作業で分離する手間が発生します。

そのため、必ず以下の **2段階ブランチ運用** を遵守してください：

```
[Phase 1: ドキュメント先行マージ]
1. develop から docs/<topic-name> ブランチを作成
2. docs/proposals/XXX-<topic-name>.md を作成・レビュー
3. origin に push し、develop 宛てに PR 作成
4. ユーザーが GitHub 上で Squash & Merge（develop に提案書が取り込まれる）

[Phase 2: 本家還元コードの実装]
5. develop を最新化（git pull origin develop）
6. develop から feature/<topic-name> ブランチを作成
7. src/ 配下および package.json のみを実装・テスト（docs/ は触らない）
8. origin に push し、develop 宛てに PR 作成
9. ユーザーが GitHub 上で Squash & Merge（develop 上に「srcのみの1コミット」が誕生）

[Phase 3: 本家への PR 提出]
10. upstream/main から pr/<topic-name> を作成
11. Phase 2 の Squash コミット（1コミット）のみを cherry-pick
12. 差分に docs/ や .agents/ が一切含まれていないことを確認して本家へ PR 送信
```

---

## 5. 🔄 実装中に仕様・設計の乖離が発生した場合の対処ルール（事後同期）

実際のコード実装を進める中で、想定外の API 仕様、制約、UI 調整などにより、事前に作成した提案書（`docs/proposals/`）と実装内容に乖離が生じる場合があります。

その際は、以下のルールを厳守してください：

### 🚫 絶対禁止（アンチパターン）
- **`feature/<topic-name>` ブランチの中で `docs/` を「ついでに」修正・コミットすること**。
  - これを行うと、Squash & Merge 時に本家提出コミットに `docs/` が不可分に混入し、cherry-pick が不可能になります。

### ✅ 正しい対処フロー（事後同期）
1. **実装優先で進める**:
   - `feature/<topic-name>` ブランチでは **`src/` 配下（および `package.json`）のみ** を修正・コミットし、PR を作成して `develop` へ Squash & Merge します。
2. **直後にドキュメント更新 PR を作成する（事後同期）**:
   - `develop` を最新化した後、`docs/sync-<topic-name>` などのブランチを作成します。
   - 実装した実際の内容に合わせて `docs/proposals/XXX-<topic-name>.md` の記述、結果、ステータス（`Implemented`）を更新します（必要に応じて `docs/SPECIFICATION_JA.md` も更新）。
   - `develop` 宛てに PR を作成し、Squash & Merge します。

※ **例外（根本的な大方針変更の場合）**: 前提の API がそもそも使えず設計を一からやり直すレベルの大変更が発生した場合は、実装作業を一旦中断し、`docs/` ブランチで提案書を先に更新・再合意してから実装を再開してください。

---

## 6. ⏪ 本家に PR が採用されなかった場合のリカバリー手順（Revert 戦略）

本家へ提出した PR が見送り（Reject）または大幅な仕様変更により取り下げられた場合、手元の `develop` をクリーンな本家追従状態に戻し、次の新機能へ進むために以下のリカバリーを行います：

1. **該当の Squash コミットを Revert**:
   - `git switch develop && git pull origin develop`
   - `git revert <不採用機能のコミットハッシュ>`
   - `git push origin develop`
   - **効果**: AI ハーネス（`AGENTS.md`、`.agents/`、`docs/`）はそのまま保持され、不採用となった `src/` の変更のみが綺麗に取り消されます。
2. **提案書ステータスの更新**:
   - `docs/proposals/XXX-<topic-name>.md` のステータスを `Closed (Rejected by Upstream)` に更新。
3. **次の機能開発へ**:
   - `develop` は本家最新と同期されているため、次の新機能提案（`docs/...`）へ安全に移行できます。


