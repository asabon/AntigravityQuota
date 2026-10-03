# Proposal 001: モデルグループ別クォータ（5h / 1w リミット）の取得と表示

- **作成日**: 2026-10-03
- **ステータス**: Implemented (Merged to develop via PR #5)
- **対象コンポーネント**: `src/utils/types.ts`, `src/core/quota_manager.ts`, `src/ui/status_bar.ts`, `src/core/config_manager.ts`, `package.json`, `src/test/`
- **関連 Issue / PR**: [PR #5 (develop)](https://github.com/asabon/AntigravityQuota/pull/5), 本家提出予定

---

## 1. 背景と課題 (Background & Problem Statement)

### 1.1 背景 (Context)
Antigravity Quota (AGQ) は、ローカルで稼働する Antigravity 言語サーバーと通信し、AI モデルのクォータ残量およびリセット時間を VS Code のステータスバー等に表示する拡張機能です。

### 1.2 課題・問題点 (Problem Statement)
- **単一リミットしか見えない問題**:
  従来の AGQ は `/exa.language_server_pb.LanguageServerService/GetUserStatus` API を使用してモデル一覧（`clientModelConfigs`）を取得していました。しかし、この API で返される各モデルの `quotaInfo` には、直近で有効な 1 つのリミット（Gemini 系は 5 時間リミットのみ、Claude 系は 1 週間リミットのみ）しか含まれていません。
- **モデル個別表示の冗長性（重複）**:
  Antigravity のバックエンドでは、同一系統のモデル（例: Gemini 3.5, 3.7, 3.8 Flash/Pro）は 1 つの共有プール（`Gemini Models`）のクォータを消費しています。そのため、モデルごとにステータスバーに並べても完全に同じ残量パーセントが重複して表示されるだけであり、実質的な価値がありませんでした。
- **IDE 本体との表示乖離**:
  Antigravity IDE 本体の設定画面（**Setting - Models**）では、Gemini や Claude に対して **「Weekly Limit Remaining」** と **「Five Hour Limit Remaining」** の両方が明確に表示されています。
- **ユーザー体験の不足**:
  Google AI Pro 等のプランを利用するユーザーにとって、直近の「5時間バースト制限」だけでなく、「今週あとどれくらい使えるか（1週間リミット）」を把握することは作業ペース配分上極めて重要ですが、従来の AGQ ではこれを確認する手段がありませんでした。

---

## 2. 調査結果・技術検証 (Investigation & Findings)

### 2.1 調査対象・エンドポイント
Antigravity 言語サーバーバイナリ（`language_server_windows_x64.exe`）の解析およびローカルプロセスへのリクエスト検証により、クォータ詳細を取得する専用エンドポイント **`RetrieveUserQuotaSummary`** が存在することを確認しました。

- **Endpoint**: `POST /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
- **Headers**:
  - `Content-Type: application/json`
  - `Connect-Protocol-Version: 1`
  - `X-Codeium-Csrf-Token: <CSRF_TOKEN>`
- **Request Body**:
  ```json
  {
    "metadata": {
      "ideName": "antigravity",
      "extensionName": "antigravity",
      "locale": "en"
    }
  }
  ```

### 2.2 実際の取得データ（検証済み）
実際にローカル環境で返却された完全な JSON レスポンス構造：

```json
{
  "response": {
    "groups": [
      {
        "displayName": "Gemini Models",
        "description": "Models within this group: Gemini Flash, Gemini Pro",
        "buckets": [
          {
            "bucketId": "gemini-weekly",
            "displayName": "Weekly Limit Remaining",
            "description": "You have used some of your weekly limit, it will fully refresh in 3 days, 19 hours.",
            "window": "weekly",
            "remainingFraction": 0.84122616,
            "resetTime": "2026-10-07T03:18:39Z"
          },
          {
            "bucketId": "gemini-5h",
            "displayName": "Five Hour Limit Remaining",
            "description": "You have used some of your 5-hour limit, it will fully refresh in 4 hours, 42 minutes.",
            "window": "5h",
            "remainingFraction": 0.9561114,
            "resetTime": "2026-10-03T12:35:53Z"
          }
        ]
      },
      {
        "displayName": "Claude and GPT models",
        "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
        "buckets": [
          {
            "bucketId": "3p-weekly",
            "displayName": "Weekly Limit Remaining",
            "window": "weekly",
            "remainingFraction": 1.0,
            "resetTime": "2026-10-10T07:53:32Z"
          },
          {
            "bucketId": "3p-5h",
            "displayName": "Five Hour Limit Remaining",
            "window": "5h",
            "remainingFraction": 1.0,
            "resetTime": "2026-10-03T12:53:32Z"
          }
        ]
      }
    ],
    "description": "Within each group, models share a weekly limit and a 5-hour limit..."
  }
}
```

---

## 3. アーキテクチャ・UI 設計 (Architecture & UI Design)

### 3.1 データモデルの拡張 (`src/utils/types.ts`)

```typescript
export interface quota_bucket_info {
	bucket_id: string;
	display_name: string;
	description?: string;
	window: string;
	remaining_fraction?: number;
	remaining_percentage?: number;
	is_exhausted: boolean;
	reset_time: Date;
	time_until_reset: number;
	time_until_reset_formatted: string;
}

export interface quota_group_info {
	display_name: string;
	description?: string;
	buckets: quota_bucket_info[];
}

export interface quota_snapshot {
	timestamp: Date;
	models: model_quota_info[];
	prompt_credits?: prompt_credits_info;
	groups?: quota_group_info[];
}

export type display_mode = 'models' | 'groups' | 'both';
```

### 3.2 メニュー（QuickPick）の UI 設計

ステータスバーをクリックした際のポップアップメニューで、最上部に共有グループ枠を配置し、グループ名の横に 1 つだけピン留めトグル用チェックマークを付与。子行として各リミット（Weekly / 5-Hour）のプログレスバーを縦並びでインデント表示します。

```text
--- Quota Groups (Toggle Pin) ---
$(check) Gemini Models
      Weekly: ▓▓▓▓▓▓▓▓░░ 79.8%    Resets in: 3d 18h
      5-Hour: ▓▓▓▓▓▓▓░░░ 69.9%    Resets in: 3h 41m

$(circle-outline) Claude and GPT models
      Weekly: ▓▓▓▓▓▓▓▓▓▓ 100.0%   Resets in: Ready
      5-Hour: ▓▓▓▓▓▓▓▓▓▓ 100.0%   Resets in: Ready

--- Model Quotas (Toggle Pin) ---
$(check) Gemini 3.8 Flash (Low)
         ▓▓▓▓▓▓▓░░░ 71.0%    Resets in: 3h 41m
...
```

- 親行または子行のどこをクリックしても、該当グループ全体のピン留めが即座にトグルされます。

### 3.3 ステータスバー表示モードの設計

設定 `agq.displayMode`（`"models"` / `"groups"` / `"both"`）および `agq.pinnedGroups` により、ステータスバーを柔軟にカスタマイズできます。

- **グループ表示例 (`displayMode: "groups"`)**:
  `$(check) Gemini [1w: 80% | 5h: 70%]  $(check) Claude/GPT [1w: 100% | 5h: 100%]`
- **短縮名**:
  `Claude and GPT models` は `Claude/GPT` と短縮表記し、GPT-OSS も同枠で共有されていることを明確化。
- **動的適応**:
  5h のみ、または 1w のみ存在するプランでも、存在するバケットのみを自動描画。

### 3.4 設定項目 (`package.json`)

| 設定キー | 型 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| `agq.displayMode` | `string` (enum) | `"models"` | ステータスバーの表示モード。<br>- `"models"`: 従来通りピン留め個別モデルを表示（100% 後方互換）<br>- `"groups"`: 共有グループ（5h / 1w）を表示（推奨）<br>- `"both"`: グループとピン留めモデルの両方を表示 |
| `agq.pinnedGroups` | `string[]` | `[]` | ステータスバーに表示するグループ一覧（例: `["Gemini"]`）。空配列の場合は全グループを表示。 |

---

## 4. 実装成果と検証結果 (Implementation & Verification)

- [x] **1. 型定義の拡張 (`src/utils/types.ts`)**:
  - `quota_group_info`, `quota_bucket_info`, `display_mode` を定義。
- [x] **2. データ取得の統合 (`src/core/quota_manager.ts`)**:
  - `Promise.allSettled` による並行呼び出しとフォールバック処理を実装。
- [x] **3. UI の拡張 (`src/ui/status_bar.ts`)**:
  - 親行＋縦並びインデント子行のメニューレンダリングを実装。
  - グループのピン留めトグル（`toggle_pinned_group`）および柔軟なフィルタリング（`is_group_pinned`）を実装。
  - 短縮名 `Claude/GPT` を適用。
- [x] **4. 設定管理の更新 (`src/core/config_manager.ts` & `package.json`)**:
  - `agq.displayMode` および `agq.pinnedGroups` を設定スキーマに追加。
- [x] **5. 自動単体テストの導入 (`src/test/`)**:
  - 外部依存ゼロの `node:test` を使用し、in-memory の VS Code モック（`src/test/setup.js`）を整備。
  - データパース、フォールバック、ステータスバーフォーマット、グループフィルタ、メニュー構築を網羅する **全 15 件のテストを実装し、すべて PASS**。
- [x] **6. 手元動作確認**:
  - Antigravity IDE 実環境（Extension Development Host）で実プロセスと通信し、正常動作を確認済み。

---

## 5. 下位互換性とリスク (Backward Compatibility & Risks)

- **100% 下位互換性の維持**:
  - デフォルトの `displayMode` は `"models"` のままであり、既存ユーザーのステータスバーや設定（`agq.pinnedModels`）を一切破壊しません。
- **プラン差異への動的適応**:
  - 1w リミットが存在しないプランや、特定グループが存在しないプランでも、返却されたバケットのみを動的に描画します。
- **API フォールバック保証**:
  - `RetrieveUserQuotaSummary` が万一失敗した場合でも、従来の `GetUserStatus` のみで静かに動作を継続します。

---

## 6. 本家（upstream）向け PR ドラフト (English PR Draft)

### Title
```
feat: support weekly and 5-hour quota groups via RetrieveUserQuotaSummary
```

### Description
```markdown
## Summary
This PR adds support for retrieving and displaying both **5-Hour** and **Weekly** shared quota limits for model groups (Gemini Models, Claude and GPT models), matching the detailed quota view found in Antigravity IDE's native "Settings > Models" page.

## Motivation & Problem
Currently, AGQ fetches quota data solely through `GetUserStatus`. However, this approach has two major limitations:
1. **Single Window Limitation**: `GetUserStatus` exposes only a single active window per model (e.g., only 5h for Gemini, only 1w for Claude), making weekly limit tracking impossible for Pro tier users.
2. **Redundancy Across Models**: Models in the same family (e.g. Gemini 3.5, 3.7, 3.8 Flash and Pro) share the same underlying group quota pool. Displaying separate status bar items for each model simply repeats identical percentages.

Exposing the underlying shared quota groups directly solves this redundancy and gives users full visibility into both their 5-hour burst limits and weekly quota.

## Changes & Implementation
1. **Endpoint Integration**: Added concurrent call to `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` alongside `GetUserStatus` via `Promise.allSettled` in `QuotaManager`.
2. **Type Definitions**: Added `quota_group_info`, `quota_bucket_info`, and `display_mode` to `src/utils/types.ts`.
3. **Dynamic Bucket Rendering**:
   - The UI does not hardcode limits; it dynamically adapts to whichever buckets (`5h`, `weekly`, etc.) are returned for the user's specific tier.
4. **Enhanced Interactive Menu**:
   - Added a "Quota Groups (Toggle Pin)" section at the top of the QuickPick menu.
   - Groups are presented with a unified toggle checkmark and indented vertical progress bars for each limit.
   - Clicking any row of a group seamlessly toggles its status bar visibility.
5. **Flexible Status Bar Configuration**:
   - Added `agq.displayMode`: `"models"` (default, 100% backward compatible), `"groups"` (shared limits with 5h/1w), or `"both"`.
   - Added `agq.pinnedGroups`: allows filtering which groups to display (e.g. `["Gemini"]`).
   - Group short name uses `Claude/GPT` to clearly reflect that GPT-OSS shares the Claude pool.
6. **Zero-Dependency Automated Tests**:
   - Added 15 comprehensive unit tests covering parsing, fallback handling, group filtering, formatting, and menu construction using Node.js built-in `node:test`.
7. **Robust Fallback**: If `RetrieveUserQuotaSummary` fails or is unavailable on older builds, the extension smoothly falls back to individual model tracking.

## Verification
- Verified against live Antigravity Language Server on Windows x64.
- All 15 unit tests passing (`npm run test`).
- Clean TypeScript build (`npm run compile`).
- Verified status bar display switching, menu interactions, and settings reactivity.
```
