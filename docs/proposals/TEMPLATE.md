# [Proposal 番号]: [機能提案のタイトル (英語/日本語)]

- **作成日**: YYYY-MM-DD
- **ステータス**: Draft / In Review / Approved / Implemented
- **対象コンポーネント**: `src/core/*`, `src/ui/*`, `package.json` など
- **関連 Issue / PR**: (本家またはフォークの Issue/PR 番号)

---

## 1. 背景と課題 (Background & Problem Statement)

### 1.1 背景 (Context)
- 現状の動作や仕様についての説明。
- どのようなユースケースや前提条件があるか。

### 1.2 課題・問題点 (Problem Statement)
- どのような不便さ、不具合、機能不足が存在するか。
- なぜ現状のままでは不十分なのか。

---

## 2. 調査結果・技術検証 (Investigation & Findings)

### 2.1 調査対象・エンドポイント・API仕様
- 検証したプロセス、API エンドポイント、内部データ構造など。
- 実際の取得データ例（JSON 等のコードブロック）。

### 2.2 技術的な実現可能性
- 実現にあたっての制約や前提条件。
- 既存ロジックとの互換性や注意点。

---

## 3. 提案内容・機能仕様 (Proposed Solution & Architecture)

### 3.1 概要 (Overview)
- 本提案で実現する機能のハイレベルな説明。

### 3.2 アーキテクチャとデータフロー (Data Flow & Architecture)
- コンポーネント間の連携やシーケンス。
- 必要に応じて Mermaid 図で可視化。

### 3.3 UI / UX 仕様 (UI Specifications)
- ステータスバーでの表示形式（正常・警告・枯渇時など）。
- クイックピックメニュー（QuickPick）での表示形式。
- モックアップや表示例。

### 3.4 設定項目 (Configuration Options)
- `package.json` に追加・変更する設定キー、型、デフォルト値、説明。

---

## 4. 実装計画・モジュール別変更点 (Implementation Plan)

- [ ] **型定義の更新 (`src/utils/types.ts`)**:
  - 新たに必要なインターフェースや型の定義。
- [ ] **データ取得ロジック (`src/core/quota_manager.ts`)**:
  - API 呼び出しの追加・変更、レスポンスのパース。
- [ ] **UI 更新 (`src/ui/status_bar.ts`)**:
  - ステータスバー項目のフォーマット変更、QuickPick メニューの更新。
- [ ] **設定管理 (`src/core/config_manager.ts` & `package.json`)**:
  - 新規設定の読み込みと反映。
- [ ] **検証・テスト**:
  - ビルド、日本語混入チェック、動作確認。

---

## 5. 下位互換性とリスク (Backward Compatibility & Risks)

- 既存の設定（`agq.pinnedModels` 等）や挙動への影響。
- 古い言語サーバーや未対応環境で動作させた場合のフォールバック挙動。

---

## 6. 本家（upstream）向け PR / Issue ドラフト (English Draft for Upstream)

本提案を本家リポジトリ（`Henrik-3/AntigravityQuota`）へ Issue または PR で提出する際の英語本文。

### Title
```
feat: ...
```

### Description
```markdown
## Summary
...

## Motivation & Problem
...

## Solution & Implementation Details
...

## Verification & Screenshots
...
```
