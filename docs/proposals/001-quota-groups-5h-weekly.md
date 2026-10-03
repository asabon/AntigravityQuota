# Proposal 001: モデルグループ別クォータ（5h / 1w リミット）の取得と表示

- **作成日**: 2026-10-03
- **ステータス**: Implemented (Merged to develop via PR #5)
- **対象コンポーネント**: `src/utils/types.ts`, `src/core/quota_manager.ts`, `src/ui/status_bar.ts`, `src/core/config_manager.ts`, `package.json`, `src/test/`
- **関連 Issue / PR**: [PR #5 (develop)](https://github.com/asabon/AntigravityQuota/pull/5), [PR #6 (develop)](https://github.com/asabon/AntigravityQuota/pull/6), 本家提出予定

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

ステータスバーをクリックした際のポップアップメニューで、最上部に共有グループ枠を配置。グループ名の横に 1 つだけピン留めトグル用チェックマークを付与し、子行として各リミット（Weekly / 5-Hour）のプログレスバーを縦並びでインデント表示します。

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

- 親行（グループ名）または子行（Weekly/5-Hour）のどこをクリックしても、該当グループ全体のピン留めが即座にトグルされます。

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
  - **以下の 5 領域・計 15 件の単体テストを実装し、すべて PASS**:
    1. **プラン・バケット解析 (`parse_quota_groups`)**: 5h と weekly の両リミットの正確なパース、5h のみ存在するプランへの適応性、空/未定義データの安全なハンドリング。
    2. **統合＆フォールバック耐性 (`parse_response`)**: 2 つの API レスポンスのマージ、`RetrieveUserQuotaSummary` 失敗時でも `GetUserStatus` のみでクラッシュせず動作継続するフォールバック検証。
    3. **ステータスバーフォーマット (`format_group_status`)**: 複数バケット/単一バケット文字列生成、残量 20% 未満の警告アイコン、枯渇時のエラーアイコン判定。
    4. **ピン留め＆フィルタリング (`is_group_pinned`, `get_group_short_name`)**: 短縮名 (`Claude/GPT`, `GPT`, `Claude`)・完全名・空配列（全許可）の柔軟な判定ロジック。
    5. **メニュー階層構造 (`build_menu_items`)**: チェックマーク付き親行と縦並びプログレスバーを持つ子行の QuickPickItem 構造生成の検証。
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

## 6. 本家（upstream）向け 事前相談 Issue ドラフト (English Issue Draft & 日本語対訳)

本家にいきなり PR を提出するのではなく、まず Issue にて課題意識と解決方針を提案し、PR 提出の可否を伺うためのドラフトです。

### 6.1 Title（件名）
```text
[Feature Request / RFC] Support 5-hour and Weekly shared quota groups via RetrieveUserQuotaSummary
```

### 6.2 Body（本文・英語）
```markdown
Hi @Henrik-3,

First of all, thank you for developing this fantastic extension! It has been incredibly helpful for monitoring Antigravity usage.

I would like to propose an enhancement regarding how quota limits are displayed, and check if you would be open to a PR.

### 1. Problem & Background
Currently, AGQ retrieves quota via `/GetUserStatus`. While this works, it presents two limitations:
1. **Hidden Weekly Limits**: `/GetUserStatus` only exposes a single active window per model (e.g., only the 5-hour limit for Gemini, and only the 1-week limit for Claude). For users on Google AI Pro and other tiers, weekly limits are essential for pacing their work, but currently can only be viewed by opening Antigravity's native "Settings > Models" page.
2. **Redundancy Across Models**: In Antigravity's backend, models of the same family (e.g. Gemini 3.5, 3.7, 3.8 Flash & Pro) actually share the same underlying group pool (`Gemini Models`). Displaying individual status bar items for each model simply repeats identical percentages. The same applies to Claude and GPT-OSS, which share the `Claude and GPT models` pool.

### 2. Proposed Solution
By calling `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` alongside `/GetUserStatus`, we can access the native shared quota groups (`Gemini Models`, `Claude and GPT models`) and their exact `5h` and `weekly` buckets.

Key aspects of the proposed design:
- **100% Backward Compatible**: Defaults to the existing `models` display mode. Existing configurations and user workflows remain completely intact.
- **New `agq.displayMode` Setting**: Allows users to choose between `"models"` (legacy individual models), `"groups"` (shared 5h/1w limits), or `"both"`.
- **Group Pinning (`agq.pinnedGroups`)**: Users can pin/unpin groups (e.g. show only Gemini or both Gemini and Claude/GPT).
- **Streamlined Menu (QuickPick)**: Displays each group with its unified checkmark and indented vertical progress bars for Weekly and 5-Hour limits.
- **Graceful Fallback**: If the quota summary endpoint is ever unavailable or fails, it silently falls back to individual model tracking.

### 3. Automated Unit Test Coverage (15 tests via built-in `node:test`)
To ensure high quality and zero regressions without adding external dependencies, 15 unit tests have been implemented covering:
- **Tier & Bucket Parsing**: Correctly parses full limits (5h & weekly), gracefully adapts to tiers with only a 5-hour limit, and safely handles missing/empty group payloads.
- **Resilience & Fallback**: Validates that if `RetrieveUserQuotaSummary` fails or times out, the extension seamlessly continues running using `GetUserStatus` model data without throwing errors.
- **Status Bar Formatting**: Tests multi-bucket strings, single-bucket fallback strings, and status icons (normal check, warning icon when <20%, error icon when exhausted).
- **Pinning & Filtering**: Tests group visibility filtering matching short names (`Claude/GPT`, `GPT`, `Claude`), full display names, and empty (allow-all) configurations.
- **Menu Hierarchy (QuickPick)**: Verifies that group parent items with checkmarks and indented child bucket rows (vertical progress bars and reset times) are constructed accurately.
- **UI Helpers**: Verifies progress bar rendering (0%, 50%, 100%), time-until-reset formatting, and legacy model abbreviation logic.

### 4. Readiness
I have already implemented and verified this feature locally against the live Antigravity Language Server on Windows x64.

Would you be open to reviewing a Pull Request for this feature? If this direction looks good to you, I would be more than happy to submit the PR!
```

### 6.3 日本語対訳（Issue）

> Henrik-3 さん、こんにちは！
> まず、この素晴らしい拡張機能を開発してくださりありがとうございます！Antigravity の使用量を監視するのに大変重宝しています。
> 
> クォータ制限の表示方法に関する機能強化を提案したく、PR を提出してもよいかご相談させてください。
> 
> #### 1. 課題と背景
> 現在、AGQ は `/GetUserStatus` 経由でクォータを取得しています。これは正常に機能していますが、2つの制約があります：
> 1. **隠された週間制限**: `/GetUserStatus` はモデルごとに直近の1つの枠しか公開しません（Gemini は 5時間枠のみ、Claude は 1週間枠のみ）。Google AI Pro 等のプランを利用するユーザーにとって、週間制限はペース配分上極めて重要ですが、現状は Antigravity 本体の「設定 > Models」を開かないと確認できません。
> 2. **モデル間の重複表示**: Antigravity のバックエンドでは、同系統のモデル（Gemini 3.5, 3.7, 3.8 Flash や Pro など）は裏側で同じグループプール（`Gemini Models`）を共有しています。そのため、モデルごとにステータスバーに並べても全く同じパーセントが重複表示されるだけです。Claude と GPT-OSS も同様に `Claude and GPT models` プールを共有しています。
> 
> #### 2. 提案する解決策
> `/GetUserStatus` と並行して `/RetrieveUserQuotaSummary` を呼び出すことで、ネイティブの共有グループ（Gemini Models、Claude and GPT models）と、それぞれの正確な `5h` および `weekly` バケットを取得できます。
> 
> 設計の主なポイント：
> - **100% 後方互換性**: デフォルトの表示モードは従来の `models` のままとし、既存ユーザーの設定や動作を一切壊しません。
> - **新設定 `agq.displayMode`**: `"models"`（従来型）、`"groups"`（共有 5h/1w 枠）、`"both"`（両方）をユーザーが選択可能。
> - **グループピン留め（`agq.pinnedGroups`）**: グループ単位で表示/非表示（例: Gemini だけ表示など）をトグル可能。
> - **整理されたメニュー UI**: 各グループに 1 つのチェックマークを付け、その下に Weekly と 5-Hour のプログレスバーを縦並びで綺麗に表示。
> - **安全なフォールバック**: 万が一クォータ概要 API が失敗・未対応の場合でも、既存のモデル個別追跡へと自動的に静かにフォールバックします。
> 
> #### 3. 自動単体テストの網羅性（組み込み `node:test` による 15 件のテスト）
> 外部依存ライブラリを一切増やさず、高い品質とデグレード防止を保証するため、以下の観点を網羅する 15 件の単体テストを追加しています：
> - **プラン・バケット解析**: 5時間枠と週間枠の両方の正確なパース、5時間枠のみのプランへの柔軟な適応、未定義・空データの安全なハンドリング。
> - **フォールバック耐性**: 万が一 `RetrieveUserQuotaSummary` がタイムアウトやエラーで失敗しても、エラーでクラッシュすることなく既存の `GetUserStatus` のモデルデータのみで動作を継続することの検証。
> - **ステータスバーのフォーマット**: 複数バケット文字列、単一バケット文字列、状態アイコン（通常、20%未満の警告アイコン、枯渇時のエラーアイコン）の描画。
> - **ピン留め・フィルタリング**: 短縮名（`Claude/GPT`, `GPT`, `Claude`）や完全名、未指定（全許可）などでの柔軟なグループ表示/非表示フィルタの検証。
> - **メニューの親子構造（QuickPick）**: チェックマーク付きの親行と、インデントされた縦並びプログレスバー・リセット時間を持つ子行が正確に構築されることの検証。
> - **UI ユーティリティ**: プログレスバー描画（0%, 50%, 100%）、リセット残り時間のフォーマット、従来通りのモデル略称生成ロジックの担保。
> 
> #### 4. 実装の準備状況
> すでに手元の Windows x64 Antigravity 言語サーバー実プロセス環境にて動作検証を完了しています。
> 
> この機能について Pull Request をレビューしていただけそうでしょうか？方向性に問題がなさそうでしたら、喜んで PR を提出させていただきます！

---

## 7. 本家（upstream）向け PR ドラフト (English PR Draft & 日本語対訳)

Issue で合意が得られた後に提出する Pull Request のドラフトです。

### 7.1 Title（件名）
```text
feat: support weekly and 5-hour quota groups via RetrieveUserQuotaSummary
```

### 7.2 Description（本文・英語）
```markdown
## Summary
This PR adds support for retrieving and displaying both **5-Hour** and **Weekly** shared quota limits for model groups (Gemini Models, Claude and GPT models), matching the detailed quota view found in Antigravity IDE's native "Settings > Models" page.

Resolves #28.

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
7. **Robust Fallback**: If `RetrieveUserQuotaSummary` fails or is unavailable on older builds, the extension smoothly falls back to individual model tracking without breaking.

## Verification
- Verified against live Antigravity Language Server on Windows x64.
- All 15 unit tests passing (`npm run test`).
- Clean TypeScript build (`npm run compile`).
- Verified status bar display switching, menu interactions, and settings reactivity.
## Screenshots
### Status Bar Display (`agq.displayMode: "groups"`)
![Status Bar](https://github.com/user-attachments/assets/f093695b-fcc3-4961-873e-f9a24dfb9d47)

### Interactive QuickPick Menu
![QuickPick Menu](https://github.com/user-attachments/assets/22219a4f-9092-4ab0-9371-d3a221c7e210)
```

### 7.3 日本語対訳（PR）

> #### 概要
> 本 PR は、Antigravity IDE 本体の「Settings > Models」ページに表示されている詳細ビューと同様に、モデルグループ（Gemini Models、Claude and GPT models）の **5時間枠** および **週間枠** の両方の共有クォータ制限を取得・表示する機能を追加します。
> 
> Issue #28 で議論された提案を実装するものです。
> 
> #### 動機と課題
> 現在、AGQ は `GetUserStatus` のみでクォータを取得しています。しかし、この方法には2つの大きな制約があります：
> 1. **単一枠の制約**: `GetUserStatus` はモデルごとに直近の1つの枠しか公開しないため（Gemini は 5時間枠のみ、Claude は 1週間枠のみ）、Pro 等のユーザーが週間制限を追跡できません。
> 2. **モデル間の重複**: 同系統のモデル（Gemini 3.5, 3.7, 3.8 の Flash や Pro 等）は裏側で同一グループのクォータプールを共有しているため、個別のモデルを並べても同じパーセントが重複するだけです。
> 
> 基礎となる共有グループを直接公開することで、この重複を解消し、5時間バースト枠と週間枠の両方を完全に可視化します。
> 
> #### 変更点と実装内容
> 1. **エンドポイントの統合**: `QuotaManager` にて `Promise.allSettled` を用い、`GetUserStatus` と並行して `/RetrieveUserQuotaSummary` を呼び出し。
> 2. **型定義**: `src/utils/types.ts` に `quota_group_info`、`quota_bucket_info`、`display_mode` を追加。
> 3. **動的バケット描画**: 固定的なリミットを仮定せず、ユーザーのプランに応じて返されたバケット（`5h`、`weekly` 等）に柔軟に適応。
> 4. **メニュー UI の強化**: QuickPick メニュー上部に「Quota Groups (Toggle Pin)」セクションを追加。1つのチェックマークとインデントされた縦並びのプログレスバーで各リミットを表示し、クリックでトグル可能に。
> 5. **柔軟なステータスバー設定**:
>    - `agq.displayMode`: `"models"`（初期値、100% 後方互換）、`"groups"`（共有 5h/1w 表示）、`"both"`。
>    - `agq.pinnedGroups`: 表示するグループの絞り込み（例: `["Gemini"]`）。
>    - 短縮名を `Claude/GPT` とし、GPT-OSS が同枠であることを明示。
> 6. **外部依存ゼロの自動テスト**: Node.js 組み込みの `node:test` を使用し、パース、フォールバック、フィルタ、メニュー構築を網羅する 15 件の単体テストを追加。
> 7. **堅牢なフォールバック**: 万が一 `RetrieveUserQuotaSummary` が失敗した場合でも、個別モデル追跡へと自動フォールバック。
> 
> #### 検証結果
> - Windows x64 の Antigravity 言語サーバー実プロセスにて動作確認済み。
> - 単体テスト 15 件すべて PASS（`npm run test`）。
> - TypeScript コンパイル通過（`npm run compile`）。
> - ステータスバー切り替え、メニュー操作、設定変更の即時反映を確認済み。
> #### スクリーンショット
> - ステータスバー表示 (`agq.displayMode: "groups"`): [画像](https://github.com/user-attachments/assets/f093695b-fcc3-4961-873e-f9a24dfb9d47)
> - インタラクティブメニュー: [画像](https://github.com/user-attachments/assets/22219a4f-9092-4ab0-9371-d3a221c7e210)
