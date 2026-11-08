# Proposal 004: Distinguish "Gemini 4 Argon" and "Gemini Models" Quota Groups

- **作成日**: 2026-10-31
- **ステータス**: Draft / Ready for Discussion
- **対象コンポーネント**: `src/ui/status_bar.ts`, `src/test/quota_manager.test.ts`
- **関連 Issue / PR**: N/A (Preparing for upstream consultation)

---

## 1. 背景と課題 (Background & Problem Statement)

### 1.1 背景 (Context)
Antigravity Quota (AGQ) は、Language Server / agy hub の `RetrieveUserQuotaSummary` エンドポイントから共有クォータグループ（Quota Groups）を取得し、ステータスバーや QuickPick メニューに表示・ピン留めする機能を提供しています（Proposal 001）。

従来の Quota グループは主に以下の 2 種類でした：
1. `Gemini Models` (Gemini Flash / Gemini Pro 共有枠)
2. `Claude and GPT models` (Claude 3.5/3.7/Opus, GPT-OSS 共有枠)

そのため、`src/ui/status_bar.ts` の `get_group_short_name()` 関数では、ステータスバー表示領域を節約するために以下のロジックで短縮名（short name）を決定していました：

```typescript
export function get_group_short_name(group_name: string): string {
	const lower = group_name.toLowerCase();
	if (lower.includes('gemini')) return 'Gemini';
	if (lower.includes('claude') && lower.includes('gpt')) return 'Claude/GPT';
	if (lower.includes('claude')) return 'Claude';
	if (lower.includes('gpt')) return 'GPT';
	return group_name.split(/\s+/)[0] || group_name;
}
```

### 1.2 課題・問題点 (Problem Statement)
最新の Antigravity IDE において、新モデル・新機能向けに **`Gemini 4 Argon`** という独立した新しい Quota グループが導入されました。

しかし、現行の `get_group_short_name()` は `lower.includes('gemini')` という広すぎる前方一致・部分一致を採用しているため、以下の不具合が発生します：

1. **ステータスバーでの表記重複（区別不能）**:
   - `Gemini Models` → `Gemini`
   - `Gemini 4 Argon` → `Gemini`
   - ステータスバー上で `$(check) Gemini [1w: 91% | 5h: 95%] $(check) Gemini [1w: 100%]` のように **全く同じ名前で 2 つ並んでしまい、どちらが Argon でどちらが通常 Gemini か判別不能** になる。
2. **QuickPick ピン留めトグルのキー衝突**:
   - `toggle_pinned_group()` では `get_group_short_name()` が返す値をキーとして `pinnedGroups` 設定に保存・比較しているため、一方をクリックすると両方のピン留め状態が意図せずトグルまたは誤判定される。

---

## 2. 調査結果・実機検証 (Investigation & Real-Machine Evidence)

実機環境（Windows 11, Antigravity IDE `agy.exe` ハブプロセス）にて、`RetrieveUserQuotaSummary` エンドポイントのレスポンスを直接取得・検証しました。

### 2.1 実機検証環境
- **OS**: Windows 11 Pro (x64)
- **検出プロセス**: `agy.exe` (PID: 2796)
- **接続ポート**: 62516 (Connect protocol over HTTPS)
- **エンドポイント**: `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`

### 2.2 取得された生データ (Raw Response)

```json
[
  {
    "displayName": "Gemini Models",
    "description": "Models within this group: Gemini Flash, Gemini Pro",
    "buckets": [
      {
        "bucketId": "gemini-weekly",
        "displayName": "Weekly Limit Remaining",
        "description": "You have used some of your weekly limit, it will fully refresh in 3 days, 21 hours.",
        "window": "weekly",
        "remainingFraction": 0.91199666,
        "resetTime": "2026-11-03T21:26:00Z"
      },
      {
        "bucketId": "gemini-5h",
        "displayName": "Five Hour Limit Remaining",
        "description": "You have used some of your 5-hour limit, it will fully refresh in 2 hours, 19 minutes.",
        "window": "5h",
        "remainingFraction": 0.94871867,
        "resetTime": "2026-10-31T02:36:02Z"
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
        "remainingFraction": 1,
        "resetTime": "2026-11-07T00:16:24Z"
      },
      {
        "bucketId": "3p-5h",
        "displayName": "Five Hour Limit Remaining",
        "window": "5h",
        "remainingFraction": 1,
        "resetTime": "2026-10-31T05:16:24Z"
      }
    ]
  },
  {
    "displayName": "Gemini 4 Argon",
    "description": "For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.",
    "buckets": [
      {
        "bucketId": "gemini-argon-wtu-weekly",
        "displayName": "Gemini 4 Argon Weekly Limit",
        "window": "weekly",
        "remainingFraction": 1,
        "resetTime": "2026-11-07T00:16:24Z"
      }
    ]
  }
]
```

### 2.3 判明した仕様
1. **グループ表示名**:
   - `"Gemini Models"`
   - `"Claude and GPT models"`
   - `"Gemini 4 Argon"`
2. **Argon のバケット構成**:
   - `gemini-argon-wtu-weekly`（週単位リミット 1 つのみ）。5時間枠は現在設定されていません（週枠のみ）。

---

## 3. 提案内容・機能仕様 (Proposed Solution & Architecture)

### 3.1 短縮名（Short Name）の候補と比較

ステータスバーでの表示形式は `$(check) ${short_name} [${bucket_parts}]` です。
本家メンテナーへの提案・相談にあたり、以下の選択肢を整理します：

| 案 | `Gemini Models` | `Gemini 4 Argon` | メリット | デメリット / 懸念 |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (公式名ママ)** | `Gemini` | **`Gemini 4 Argon`** | • 公式の名称そのままで誤解やハルシネーションの余地がない<br>• 本家メンテナーに最も受け入れられやすい | • ステータスバーの横幅をやや消費する |
| **Option B (短縮形)** | `Gemini` | **`G4 Argon`** | • モデル略称（`G3.5F` 等）と命名規則が近くコンパクト | • 公式の略称ではなく拡張機能独自の造語とみなされる可能性 |
| **Option C (バージョン)** | `Gemini` | **`Gemini 4`** | • バージョンで差別化 | • `Argon` というコードネーム情報が脱落する |

> 💡 **推奨方針**:
> 本家への提案としては、**Option A（`Gemini 4 Argon`）を基本**としつつ、「ステータスバーの横幅を節約したい場合は **Option B（`G4 Argon`）** も選択可能です」とメンテナーに選択肢を委ねる形が最も好印象です。

### 3.2 短縮名判定ロジックの改善 (`src/ui/status_bar.ts`)

広すぎる `includes('gemini')` を排除し、完全一致および具体的な名前を優先するロジックに改修します。

```typescript
/**
 * Short names mapping for well-known quota groups.
 */
const KNOWN_GROUP_NAMES: Record<string, string> = {
	'gemini models': 'Gemini',
	'claude and gpt models': 'Claude/GPT',
	// Option A: 'gemini 4 argon': 'Gemini 4 Argon',
	// Option B: 'gemini 4 argon': 'G4 Argon',
};

export function get_group_short_name(group_name: string): string {
	const trimmed = group_name.trim();
	const lower = trimmed.toLowerCase();

	if (KNOWN_GROUP_NAMES[lower]) {
		return KNOWN_GROUP_NAMES[lower];
	}

	// Specific match for Argon group
	if (lower.includes('argon')) {
		return 'Gemini 4 Argon'; // or 'G4 Argon'
	}

	if (lower.includes('claude') && lower.includes('gpt')) {
		return 'Claude/GPT';
	}
	if (lower === 'gemini' || lower === 'gemini models') {
		return 'Gemini';
	}
	if (lower.includes('claude')) {
		return 'Claude';
	}
	if (lower.includes('gpt')) {
		return 'GPT';
	}

	// Fallback: Strip trailing " Models" / " models"
	const stripped = trimmed.replace(/\s+models$/i, '');
	return stripped || group_name;
}
```

### 3.3 ピン留め（`is_group_pinned`）との整合性

`is_group_pinned` では `short_name` と `full_name` の両方で比較を行っているため、`short_name` が一意になることで、`Gemini Models` と `Gemini 4 Argon` を個別にトグル可能になります。

---

## 4. 下位互換性と影響 (Backward Compatibility)

1. **既存の `pinnedGroups` 設定**:
   - 既存ユーザーの設定に `"Gemini"` が登録されている場合、`Gemini Models` のみにマッチし、新設された `Gemini 4 Argon` には影響しません。
   - 新規ユーザーまたは全ピン留め状態（デフォルト）では両方が正常に独立して表示されます。
2. **古い言語サーバー**:
   - `Gemini 4 Argon` が存在しない旧環境では、従来どおり `Gemini Models` と `Claude and GPT models` のみが表示され、互換性に影響はありません。

---

## 5. 本家（upstream）メンテナー向け相談 Issue / PR ドラフト

まだ Issue は投稿しません。相談タイミングになった際にそのまま使用できるドラフトを以下に準備します。

### Issue Title
`fix(ui): distinguish "Gemini 4 Argon" quota group from "Gemini Models"`

### Issue Body
````markdown
### Problem Description

In recent Antigravity IDE updates, a new quota group **"Gemini 4 Argon"** has been introduced alongside the existing **"Gemini Models"** and **"Claude and GPT models"**.

Currently, `get_group_short_name()` in `src/ui/status_bar.ts` formats any group containing `"gemini"` as `'Gemini'`:

```typescript
export function get_group_short_name(group_name: string): string {
	const lower = group_name.toLowerCase();
	if (lower.includes('gemini')) return 'Gemini';
	...
}
```

As a result:
- Both `Gemini Models` and `Gemini 4 Argon` are abbreviated to **`Gemini`**.
- The status bar displays duplicate entries that cannot be distinguished:
  `$(check) Gemini [1w: 91% | 5h: 95%]  $(check) Gemini [1w: 100%]`
- Toggling group pin in the QuickPick menu collides because both share the same short name key.

### Real-Machine Evidence (API Response)

Verified with `RetrieveUserQuotaSummary` on Windows 11 (Antigravity `agy` hub process):

```json
[
  {
    "displayName": "Gemini Models",
    "description": "Models within this group: Gemini Flash, Gemini Pro",
    "buckets": [ ... ]
  },
  {
    "displayName": "Claude and GPT models",
    "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
    "buckets": [ ... ]
  },
  {
    "displayName": "Gemini 4 Argon",
    "description": "For paid Pro plans, Argon quota is separate...",
    "buckets": [
      {
        "bucketId": "gemini-argon-wtu-weekly",
        "displayName": "Gemini 4 Argon Weekly Limit",
        "window": "weekly",
        "remainingFraction": 1.0
      }
    ]
  }
]
```

### Proposed Solutions & Discussion

We have prepared a fix and would love to hear your preference regarding the short name for the status bar:

- **Option A (Official display name)**: `'Gemini 4 Argon'`
  - Status bar: `$(check) Gemini 4 Argon [1w: 100%]`
  - Matches the exact API response without abbreviation risk.
- **Option B (Compact abbreviation)**: `'G4 Argon'`
  - Status bar: `$(check) G4 Argon [1w: 100%]`
  - More compact, consistent with model abbreviations like `G3.5F`.
- **Option C (Fallback cleanup)**:
  - Strip trailing `Models` while keeping specific names intact.

Which naming format do you prefer for the status bar? I can submit a clean PR right away based on your preference!
````

