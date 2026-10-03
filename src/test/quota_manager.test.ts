import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { QuotaManager } from '../core/quota_manager';
import { StatusBarManager, format_group_status, get_abbreviation, draw_progress_bar, is_group_pinned, get_group_short_name } from '../ui/status_bar';
import { server_user_status_response, server_user_quota_summary_response, quota_group_info, quota_snapshot } from '../utils/types';

describe('QuotaManager - parse_quota_groups', () => {
	const qm = new QuotaManager();
	const baseNow = new Date('2026-10-03T12:00:00Z');

	it('should parse full groups and buckets (5h and weekly limits)', () => {
		const mockSummary: server_user_quota_summary_response = {
			response: {
				groups: [
					{
						displayName: 'Gemini Models',
						description: 'Models within this group: Gemini Flash, Gemini Pro',
						buckets: [
							{
								bucketId: 'gemini-weekly',
								displayName: 'Weekly Limit Remaining',
								window: 'weekly',
								remainingFraction: 0.84,
								resetTime: '2026-10-07T03:00:00Z',
							},
							{
								bucketId: 'gemini-5h',
								displayName: 'Five Hour Limit Remaining',
								window: '5h',
								remainingFraction: 0.95,
								resetTime: '2026-10-03T16:00:00Z',
							},
						],
					},
					{
						displayName: 'Claude and GPT models',
						buckets: [
							{
								bucketId: '3p-weekly',
								displayName: 'Weekly Limit Remaining',
								window: 'weekly',
								remainingFraction: 1.0,
								resetTime: '2026-10-10T12:00:00Z',
							},
						],
					},
				],
			},
		};

		const groups = qm.parse_quota_groups(mockSummary, baseNow);
		assert.ok(groups);
		assert.strictEqual(groups.length, 2);

		// Gemini group
		assert.strictEqual(groups[0].display_name, 'Gemini Models');
		assert.strictEqual(groups[0].buckets.length, 2);
		assert.strictEqual(groups[0].buckets[0].window, 'weekly');
		assert.strictEqual(groups[0].buckets[0].remaining_percentage, 84);
		assert.strictEqual(groups[0].buckets[0].is_exhausted, false);
		assert.strictEqual(groups[0].buckets[1].window, '5h');
		assert.strictEqual(groups[0].buckets[1].remaining_percentage, 95);

		// Claude group
		assert.strictEqual(groups[1].display_name, 'Claude and GPT models');
		assert.strictEqual(groups[1].buckets.length, 1);
		assert.strictEqual(groups[1].buckets[0].remaining_percentage, 100);
	});

	it('should adapt to tiers with only 5h limit (no weekly limit)', () => {
		const mockSummary: server_user_quota_summary_response = {
			response: {
				groups: [
					{
						displayName: 'Gemini Models',
						buckets: [
							{
								bucketId: 'gemini-5h',
								displayName: 'Five Hour Limit Remaining',
								window: '5h',
								remainingFraction: 0.95,
								resetTime: '2026-10-03T16:00:00Z',
							},
						],
					},
				],
			},
		};

		const groups = qm.parse_quota_groups(mockSummary, baseNow);
		assert.ok(groups);
		assert.strictEqual(groups.length, 1);
		assert.strictEqual(groups[0].buckets.length, 1);
		assert.strictEqual(groups[0].buckets[0].window, '5h');
	});

	it('should return undefined when groups are empty or missing', () => {
		assert.strictEqual(qm.parse_quota_groups(undefined), undefined);
		assert.strictEqual(qm.parse_quota_groups({}), undefined);
		assert.strictEqual(qm.parse_quota_groups({ response: { groups: [] } }), undefined);
	});
});

describe('QuotaManager - parse_response integration & fallback', () => {
	const qm = new QuotaManager();
	const baseNow = new Date('2026-10-03T12:00:00Z');

	const mockUserStatus: server_user_status_response = {
		userStatus: {
			name: 'Test User',
			email: 'test@example.com',
			cascadeModelConfigData: {
				clientModelConfigs: [
					{
						label: 'Gemini 3.8 Flash (Low)',
						modelOrAlias: { model: 'gemini-3.8-flash-low' },
						quotaInfo: {
							remainingFraction: 0.98,
							resetTime: '2026-10-03T16:00:00Z',
						},
					},
				],
			},
		},
	};

	it('should merge both models and groups when quota summary is present', () => {
		const mockSummary: server_user_quota_summary_response = {
			response: {
				groups: [
					{
						displayName: 'Gemini Models',
						buckets: [
							{
								bucketId: 'gemini-5h',
								displayName: 'Five Hour Limit',
								window: '5h',
								remainingFraction: 0.95,
								resetTime: '2026-10-03T16:00:00Z',
							},
						],
					},
				],
			},
		};

		const snapshot = qm.parse_response(mockUserStatus, mockSummary, baseNow);
		assert.strictEqual(snapshot.models.length, 1);
		assert.strictEqual(snapshot.models[0].label, 'Gemini 3.8 Flash (Low)');
		assert.ok(snapshot.groups);
		assert.strictEqual(snapshot.groups.length, 1);
	});

	it('should fallback gracefully when quota summary is missing or failed', () => {
		const snapshot = qm.parse_response(mockUserStatus, undefined, baseNow);
		assert.strictEqual(snapshot.models.length, 1);
		assert.strictEqual(snapshot.models[0].label, 'Gemini 3.8 Flash (Low)');
		assert.strictEqual(snapshot.groups, undefined);
	});
});

describe('StatusBar Formatting - format_group_status', () => {
	it('should format group with multiple buckets', () => {
		const group: quota_group_info = {
			display_name: 'Gemini Models',
			buckets: [
				{
					bucket_id: 'gemini-5h',
					display_name: 'Five Hour Limit',
					window: '5h',
					remaining_fraction: 0.956,
					remaining_percentage: 95.6,
					is_exhausted: false,
					reset_time: new Date(),
					time_until_reset: 1000,
					time_until_reset_formatted: '1h',
				},
				{
					bucket_id: 'gemini-weekly',
					display_name: 'Weekly Limit',
					window: 'weekly',
					remaining_fraction: 0.841,
					remaining_percentage: 84.1,
					is_exhausted: false,
					reset_time: new Date(),
					time_until_reset: 1000,
					time_until_reset_formatted: '3d',
				},
			],
		};

		const formatted = format_group_status(group);
		assert.strictEqual(formatted, '$(check) Gemini [5h: 96% | 1w: 84%]');
	});

	it('should format group with single 5h bucket', () => {
		const group: quota_group_info = {
			display_name: 'Gemini Models',
			buckets: [
				{
					bucket_id: 'gemini-5h',
					display_name: 'Five Hour Limit',
					window: '5h',
					remaining_fraction: 0.95,
					remaining_percentage: 95,
					is_exhausted: false,
					reset_time: new Date(),
					time_until_reset: 1000,
					time_until_reset_formatted: '1h',
				},
			],
		};

		const formatted = format_group_status(group);
		assert.strictEqual(formatted, '$(check) Gemini [5h: 95%]');
	});

	it('should show warning icon when percentage is low (< 20%)', () => {
		const group: quota_group_info = {
			display_name: 'Claude and GPT models',
			buckets: [
				{
					bucket_id: '3p-weekly',
					display_name: 'Weekly Limit',
					window: 'weekly',
					remaining_fraction: 0.15,
					remaining_percentage: 15,
					is_exhausted: false,
					reset_time: new Date(),
					time_until_reset: 1000,
					time_until_reset_formatted: '1h',
				},
			],
		};

		const formatted = format_group_status(group);
		assert.strictEqual(formatted, '$(warning) Claude/GPT [1w: 15%]');
	});

	it('should show error icon when quota is exhausted', () => {
		const group: quota_group_info = {
			display_name: 'Gemini Models',
			buckets: [
				{
					bucket_id: 'gemini-5h',
					display_name: 'Five Hour Limit',
					window: '5h',
					remaining_fraction: 0,
					remaining_percentage: 0,
					is_exhausted: true,
					reset_time: new Date(),
					time_until_reset: 1000,
					time_until_reset_formatted: '1h',
				},
			],
		};

		const formatted = format_group_status(group);
		assert.strictEqual(formatted, '$(error) Gemini [5h: 0%]');
	});
});

describe('UI Utilities', () => {
	it('should abbreviate model names', () => {
		assert.strictEqual(get_abbreviation('Gemini 3.5 Flash (Medium)'), 'G3.5F(M)');
		assert.strictEqual(get_abbreviation('Claude Sonnet 4.6 (Thinking)'), 'Claude S4.6T');
		assert.strictEqual(get_abbreviation('Custom Model 9'), 'CM9');
	});

	it('should draw progress bars correctly', () => {
		assert.strictEqual(draw_progress_bar(100), '▓▓▓▓▓▓▓▓▓▓');
		assert.strictEqual(draw_progress_bar(50), '▓▓▓▓▓░░░░░');
		assert.strictEqual(draw_progress_bar(0), '░░░░░░░░░░');
	});

	it('should format remaining times', () => {
		const qm = new QuotaManager();
		const futureDate = new Date('2026-10-03T15:30:00Z');
		assert.strictEqual(qm.format_time(0, futureDate), 'Ready');
		assert.strictEqual(qm.format_time(-100, futureDate), 'Ready');
		assert.ok(qm.format_time(30 * 60 * 1000, futureDate).startsWith('30m'));
		assert.ok(qm.format_time(150 * 60 * 1000, futureDate).startsWith('2h 30m'));
	});

	it('should filter pinned groups correctly', () => {
		assert.strictEqual(is_group_pinned('Gemini Models', []), true);
		assert.strictEqual(is_group_pinned('Gemini Models', ['Gemini']), true);
		assert.strictEqual(is_group_pinned('Claude and GPT models', ['Gemini']), false);
		assert.strictEqual(is_group_pinned('Claude and GPT models', ['Claude']), true);
		assert.strictEqual(is_group_pinned('Claude and GPT models', ['Claude and GPT models']), true);
		assert.strictEqual(is_group_pinned('Claude and GPT models', ['GPT']), true);
		assert.strictEqual(is_group_pinned('Claude and GPT models', ['Claude/GPT']), true);
		assert.strictEqual(is_group_pinned('Gemini Models', ['none']), false);
	});

	it('should get short name for quota groups', () => {
		assert.strictEqual(get_group_short_name('Gemini Models'), 'Gemini');
		assert.strictEqual(get_group_short_name('Claude and GPT models'), 'Claude/GPT');
	});
});
describe('StatusBarManager - build_menu_items', () => {
	it('should format unified group items with progress bars and descriptions', () => {
		const sb = new StatusBarManager();
		const snapshot: quota_snapshot = {
			timestamp: new Date(),
			models: [],
			groups: [
				{
					display_name: 'Gemini Models',
					buckets: [
						{
							bucket_id: 'gemini-5h',
							display_name: 'Five Hour Limit',
							window: '5h',
							remaining_fraction: 0.7,
							remaining_percentage: 70,
							is_exhausted: false,
							reset_time: new Date(),
							time_until_reset: 1000,
							time_until_reset_formatted: '3h',
						},
						{
							bucket_id: 'gemini-weekly',
							display_name: 'Weekly Limit',
							window: 'weekly',
							remaining_fraction: 0.8,
							remaining_percentage: 80,
							is_exhausted: false,
							reset_time: new Date(),
							time_until_reset: 1000,
							time_until_reset_formatted: '3d',
						},
					],
				},
			],
		};

		sb.update(snapshot, false, 'groups');
		const items = sb.build_menu_items();

		// Check section header
		assert.ok(items.some(i => i.label === 'Quota Groups (Toggle Pin)'));

		// Check unified group item
		const geminiItem = items.find(i => (i as any).group_name === 'Gemini');
		assert.ok(geminiItem);
		assert.ok(geminiItem.label.includes('Gemini Models'));
		assert.strictEqual(geminiItem.description, '[5h: 70% | 1w: 80%]');
		assert.ok(geminiItem.detail?.includes('5h: ▓▓▓▓▓▓▓░░░ 70.0% (3h)'));
		assert.ok(geminiItem.detail?.includes('Weekly: ▓▓▓▓▓▓▓▓░░ 80.0% (3d)'));
	});
});
