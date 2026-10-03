/**
 * Status Bar UI Manager
 */

import * as vscode from 'vscode';
import {quota_snapshot, model_quota_info, quota_group_info, display_mode} from '../utils/types';

/** Mapping of model labels to short abbreviations for status bar display */
const MODEL_ABBREVIATIONS: Record<string, string> = {
	'Gemini 3.5 Flash (Low)': 'G3.5F(L)',
	'Gemini 3.5 Flash (Medium)': 'G3.5F(M)',
	'Gemini 3.5 Flash (High)': 'G3.5F(H)',
	'Gemini 3.1 Pro (High)': 'G3.1P(H)',
	'Gemini 3.1 Pro (Low)': 'G3.1P(L)',
	'Gemini 3 Pro (High)': 'G3P(H)',
	'Gemini 3 Pro (Low)': 'G3P(L)',
	'Gemini 3 Flash': 'G3F',
	'Claude Sonnet 4.6 (Thinking)': 'Claude S4.6T',
	'Claude Opus 4.6 (Thinking)': 'Claude O4.6T',
	'Claude Sonnet 4.5': 'Claude S4.5',
	'Claude Sonnet 4.5 (Thinking)': 'Claude S4.5T',
	'Claude Opus 4.5 (Thinking)': 'Claude O4.5T',
	'GPT-OSS 120B (Medium)': 'GPT-OSS (M)',
};

/** Get short abbreviation for a model label */
export function get_abbreviation(label: string): string {
	if (MODEL_ABBREVIATIONS[label]) {
		return MODEL_ABBREVIATIONS[label];
	}
	// Fallback: generate abbreviation from first letters of words + numbers
	return label
		.split(/[\s\-_()]+/)
		.filter(Boolean)
		.map(word => {
			const match = word.match(/^([A-Za-z]?)(.*)$/);
			if (match) {
				return match[1].toUpperCase() + (word.match(/\d+/) || [''])[0];
			}
			return word[0]?.toUpperCase() || '';
		})
		.join('')
		.slice(0, 5);
}

/** Get short label for a quota group */
export function get_group_short_name(group_name: string): string {
	const lower = group_name.toLowerCase();
	if (lower.includes('gemini')) return 'Gemini';
	if (lower.includes('claude')) return 'Claude';
	if (lower.includes('gpt')) return 'GPT';
	return group_name.split(/\s+/)[0] || group_name;
}

/** Format a single quota group into status bar string */
export function format_group_status(group: quota_group_info): string {
	const short_name = get_group_short_name(group.display_name);
	const bucket_parts: string[] = [];

	let min_pct: number | undefined;
	let has_exhausted = false;

	for (const b of group.buckets) {
		const pct = b.remaining_percentage;
		if (b.is_exhausted) has_exhausted = true;
		if (pct !== undefined) {
			if (min_pct === undefined || pct < min_pct) {
				min_pct = pct;
			}
		}

		const pct_str = pct !== undefined ? `${pct.toFixed(0)}%` : 'N/A';
		const window_label = b.window === 'weekly' ? '1w' : b.window;
		bucket_parts.push(`${window_label}: ${pct_str}`);
	}

	const icon = has_exhausted ? '$(error)' : min_pct !== undefined && min_pct < 20 ? '$(warning)' : '$(check)';
	return `${icon} ${short_name} [${bucket_parts.join(' | ')}]`;
}

/** Draw a progress bar string */
export function draw_progress_bar(percentage: number): string {
	const total = 10;
	const filled = Math.round((percentage / 100) * total);
	const empty = Math.max(0, total - filled);
	return '▓'.repeat(Math.max(0, filled)) + '░'.repeat(empty);
}

export class StatusBarManager {
	private item: vscode.StatusBarItem;
	private last_snapshot: quota_snapshot | undefined;

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.item.command = 'agq.show_menu';
		this.item.text = '$(rocket) AGQ';
		this.item.show();
	}

	show_loading() {
		this.item.text = '$(sync~spin) AGQ';
		this.item.show();
	}

	show_error(msg: string) {
		this.item.text = '$(error) AGQ';
		this.item.tooltip = msg;
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.item.show();
	}

	update(snapshot: quota_snapshot, show_credits: boolean, mode?: display_mode) {
		this.last_snapshot = snapshot;

		const config = vscode.workspace.getConfiguration('agq');
		const current_mode: display_mode = mode ?? config.get<display_mode>('displayMode') ?? 'models';
		const pinned = this.get_pinned_models();
		const parts: string[] = [];

		// 1. Group limits
		if ((current_mode === 'groups' || current_mode === 'both') && snapshot.groups && snapshot.groups.length > 0) {
			for (const group of snapshot.groups) {
				parts.push(format_group_status(group));
			}
		}

		// 2. Individual pinned models
		if (current_mode === 'models' || current_mode === 'both' || (current_mode === 'groups' && parts.length === 0)) {
			const pinned_models = snapshot.models
				.filter(m => pinned.includes(m.model_id))
				.sort((a, b) => a.label.localeCompare(b.label));

			for (const m of pinned_models) {
				const pct = m.remaining_percentage !== undefined ? `${m.remaining_percentage.toFixed(0)}%` : 'N/A';
				const status_icon = m.is_exhausted
					? '$(error)'
					: m.remaining_percentage !== undefined && m.remaining_percentage < 20
					? '$(warning)'
					: '$(check)';
				const abbrev = get_abbreviation(m.label);
				parts.push(`${status_icon} ${abbrev}: ${pct}`);
			}
		}

		if (parts.length === 0) {
			this.item.text = '$(rocket) AGQ';
		} else {
			this.item.text = parts.join('  ');
		}

		this.item.backgroundColor = undefined;
		this.item.tooltip = 'Click to view Antigravity Quota details';
		this.item.show();
	}

	show_menu() {
		const pick = vscode.window.createQuickPick();
		pick.title = 'Antigravity Quota';
		pick.placeholder = 'Click a model to toggle its visibility in the status bar';
		pick.matchOnDescription = false;
		pick.matchOnDetail = false;
		pick.canSelectMany = false;

		pick.items = this.build_menu_items();

		let currentActiveItem: vscode.QuickPickItem | undefined;

		pick.onDidChangeActive(items => {
			currentActiveItem = items[0];
		});

		pick.onDidAccept(async () => {
			if (currentActiveItem && 'model_id' in currentActiveItem) {
				await this.toggle_pinned_model((currentActiveItem as any).model_id);
				pick.items = this.build_menu_items();
				if (this.last_snapshot) {
					const config = vscode.workspace.getConfiguration('agq');
					this.update(
						this.last_snapshot,
						!!config.get('showPromptCredits'),
						config.get<display_mode>('displayMode')
					);
				}
			}
		});

		pick.onDidHide(() => {
			pick.dispose();
		});

		pick.show();
	}

	private get_pinned_models(): string[] {
		const config = vscode.workspace.getConfiguration('agq');
		return config.get<string[]>('pinnedModels') || [];
	}

	private async toggle_pinned_model(model_id: string): Promise<void> {
		const config = vscode.workspace.getConfiguration('agq');
		const pinned = [...(config.get<string[]>('pinnedModels') || [])];

		const index = pinned.indexOf(model_id);
		if (index >= 0) {
			pinned.splice(index, 1);
		} else {
			pinned.push(model_id);
		}

		await config.update('pinnedModels', pinned, vscode.ConfigurationTarget.Global);
	}

	public build_menu_items(): vscode.QuickPickItem[] {
		const items: vscode.QuickPickItem[] = [];
		const snapshot = this.last_snapshot;
		const pinned = this.get_pinned_models();

		// Section: Shared Quota Groups
		if (snapshot?.groups && snapshot.groups.length > 0) {
			items.push({label: 'Quota Groups (Shared Limits)', kind: vscode.QuickPickItemKind.Separator});

			for (const group of snapshot.groups) {
				for (const bucket of group.buckets) {
					const pct = bucket.remaining_percentage;
					const pct_display = pct !== undefined ? `${pct.toFixed(1)}%` : 'N/A';
					const bar = pct !== undefined ? draw_progress_bar(pct) : '░'.repeat(10);
					const status_icon = bucket.is_exhausted
						? '$(error)'
						: pct !== undefined && pct < 20
						? '$(warning)'
						: '$(check)';

					items.push({
						label: `   ${status_icon} ${group.display_name} - ${bucket.display_name}`,
						description: `${bar} ${pct_display}`,
						detail: `      Resets in: ${bucket.time_until_reset_formatted}`,
					});
				}
			}
		}

		// Section: Individual Models
		items.push({label: 'Model Quotas (Toggle Pin)', kind: vscode.QuickPickItemKind.Separator});

		if (snapshot && snapshot.models.length > 0) {
			for (const m of snapshot.models) {
				const pct = m.remaining_percentage;
				const pct_display = pct !== undefined ? `${pct.toFixed(1)}%` : 'N/A';
				const bar = pct !== undefined ? draw_progress_bar(pct) : '░'.repeat(10);
				const is_pinned = pinned.includes(m.model_id);

				const selection_icon = is_pinned ? '$(check)' : '$(circle-outline)';
				const status_icon = m.is_exhausted ? '$(error)' : pct !== undefined && pct < 20 ? '$(warning)' : '';

				const item: vscode.QuickPickItem & {model_id?: string} = {
					label: `${selection_icon} ${status_icon ? status_icon + ' ' : ''}${m.label}`,
					description: `${bar} ${pct_display}`,
					detail: `    Resets in: ${m.time_until_reset_formatted}`,
				};

				(item as any).model_id = m.model_id;
				items.push(item);
			}
		} else {
			items.push({
				label: '$(info) No model data',
				description: 'Waiting for quota info...',
			});
		}

		return items;
	}

	dispose() {
		this.item.dispose();
	}
}
