import {resetMockConfig, setMockConfig, getMockConfig} from './setup';
import {describe, it, afterEach} from 'node:test';
import * as assert from 'node:assert';
import {StatusBarManager} from '../ui/status_bar';
import {quota_snapshot} from '../utils/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

describe('StatusBarManager - menu focus restore and displayMode widening', () => {
	const origCreateQuickPick = vscode.window.createQuickPick;
	const origGetConfiguration = vscode.workspace.getConfiguration;

	afterEach(() => {
		vscode.window.createQuickPick = origCreateQuickPick;
		vscode.workspace.getConfiguration = origGetConfiguration;
		resetMockConfig();
	});

	function create_snapshot(): quota_snapshot {
		return {
			timestamp: new Date('2026-11-27T00:00:00Z'),
			models: [
				{
					label: 'Gemini 4 Hydrogen',
					model_id: 'gemini-4-hydrogen',
					remaining_fraction: 0.9,
					remaining_percentage: 90,
					is_exhausted: false,
					reset_time: new Date('2026-11-27T05:00:00Z'),
					time_until_reset: 18000000,
					time_until_reset_formatted: '5h 0m',
				},
			],
			groups: [
				{
					display_name: 'Gemini Models',
					buckets: [
						{
							bucket_id: 'b-5h',
							display_name: '5-Hour',
							window: '5h',
							remaining_fraction: 0.8,
							remaining_percentage: 80,
							is_exhausted: false,
							reset_time: new Date('2026-11-27T05:00:00Z'),
							time_until_reset: 18000000,
							time_until_reset_formatted: '5h 0m',
						},
					],
				},
			],
		};
	}

	it('should restore focus to the toggled group parent row even though its selection icon label changes', async () => {
		resetMockConfig();
		setMockConfig('agq.pinnedGroups', ['none']);
		setMockConfig('agq.displayMode', 'groups');

		let onDidChangeActiveCb: ((items: any[]) => void) | undefined;
		let onDidAcceptCb: (() => Promise<void>) | undefined;
		const mockPick: any = {
			items: [] as any[],
			activeItems: [] as any[],
			show: () => {},
			dispose: () => {},
			onDidChangeActive: (cb: (items: any[]) => void) => {
				onDidChangeActiveCb = cb;
			},
			onDidAccept: (cb: () => Promise<void>) => {
				onDidAcceptCb = cb;
			},
			onDidHide: () => {},
		};
		vscode.window.createQuickPick = () => mockPick;

		const manager = new StatusBarManager();
		manager.update(create_snapshot(), false, 'groups');
		manager.show_menu();

		const parentBefore = mockPick.items.find(
			(i: any) => i.group_display_name === 'Gemini Models' && i.bucket_id === undefined
		);
		assert.ok(parentBefore, 'Group parent item must exist');
		assert.ok(parentBefore.label.startsWith('$(circle-outline)'));

		onDidChangeActiveCb?.([parentBefore]);
		await onDidAcceptCb?.();

		const parentAfter = mockPick.items.find(
			(i: any) => i.group_display_name === 'Gemini Models' && i.bucket_id === undefined
		);
		assert.ok(parentAfter, 'Rebuilt group parent item must exist');
		assert.ok(parentAfter.label.startsWith('$(check)'));
		assert.strictEqual(mockPick.activeItems[0], parentAfter);
	});

	it('should read legacy agQuota.displayMode via ConfigManager when widening displayMode on model pin', async () => {
		resetMockConfig();
		setMockConfig('agQuota.displayMode', 'groups');

		const manager = new StatusBarManager();
		await (manager as any).toggle_pinned_model('gemini-4-hydrogen');

		assert.strictEqual(getMockConfig('agq.displayMode'), 'both');
	});

	it('should update displayMode at the active override scope (WorkspaceFolder / Workspace / Global)', async () => {
		const cases = [
			{
				name: 'WorkspaceFolder',
				inspectResult: {workspaceFolderValue: 'groups', workspaceValue: 'models', globalValue: 'models'},
				expectedTarget: vscode.ConfigurationTarget.WorkspaceFolder,
			},
			{
				name: 'Workspace',
				inspectResult: {workspaceFolderValue: undefined, workspaceValue: 'groups', globalValue: 'models'},
				expectedTarget: vscode.ConfigurationTarget.Workspace,
			},
			{
				name: 'Global',
				inspectResult: {workspaceFolderValue: undefined, workspaceValue: undefined, globalValue: 'groups'},
				expectedTarget: vscode.ConfigurationTarget.Global,
			},
		];

		for (const tc of cases) {
			resetMockConfig();
			setMockConfig('agq.displayMode', 'groups');

			const updates: Array<{key: string; value: any; target: number}> = [];
			vscode.workspace.getConfiguration = (section?: string) => {
				const base = origGetConfiguration(section);
				return {
					...base,
					inspect: (key: string) => (key === 'displayMode' ? tc.inspectResult : base.inspect(key)),
					update: async (key: string, value: any, target: number) => {
						updates.push({key, value, target});
						return base.update(key, value, target);
					},
				};
			};

			const manager = new StatusBarManager();
			await (manager as any).toggle_pinned_model('gemini-4-hydrogen');

			const displayModeUpdate = updates.find(u => u.key === 'displayMode');
			assert.ok(displayModeUpdate, `${tc.name}: displayMode should be updated`);
			assert.strictEqual(displayModeUpdate.value, 'both');
			assert.strictEqual(displayModeUpdate.target, tc.expectedTarget, `${tc.name}: target mismatch`);
		}
	});
});
