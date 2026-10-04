import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
	calculate_weekly_pace,
	WEEKLY_CYCLE_MS,
	PACE_BUFFER_THRESHOLD,
} from '../core/pace_calculator';
import {
	format_group_status,
	sort_buckets,
	StatusBarManager,
} from '../ui/status_bar';
import { quota_bucket_info, quota_group_info, quota_snapshot } from '../utils/types';

describe('PaceCalculator - calculate_weekly_pace', () => {
	it('should return null when remaining_fraction is undefined', () => {
		const result = calculate_weekly_pace(undefined, WEEKLY_CYCLE_MS / 2);
		assert.strictEqual(result, null);
	});

	it('should identify ahead of pace with surplus buffer (>= +5%)', () => {
		// 4 days left out of 7 days => target = (4/7) * 100 = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 80% => buffer = 80 - 57.14 = +22.86%
		const result = calculate_weekly_pace(0.8, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'ahead');
		assert.strictEqual(result.emoji, '🟢');
		assert.strictEqual(Math.round(result.buffer_percentage), 23);
		assert.strictEqual(Math.round(result.target_quota_percentage), 57);
	});

	it('should identify behind pace with negative buffer (< -5%)', () => {
		// 4 days left => target = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 45% => buffer = 45 - 57.14 = -12.14%
		const result = calculate_weekly_pace(0.45, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'behind');
		assert.strictEqual(result.emoji, '🔴');
		assert.strictEqual(Math.round(result.buffer_percentage), -12);
	});

	it('should identify on track when buffer is within [-5%, +5%]', () => {
		// 4 days left => target = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 58% => buffer = 58 - 57.14 = +0.86%
		const result = calculate_weekly_pace(0.58, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'on_track');
		assert.strictEqual(result.emoji, '🟡');
	});

	it('should handle boundary values (+5.0% and -5.0%)', () => {
		const half_week = WEEKLY_CYCLE_MS / 2; // target = 50%

		// Exactly +5.0% buffer => ahead
		const ahead_result = calculate_weekly_pace(0.55, half_week);
		assert.ok(ahead_result);
		assert.strictEqual(ahead_result.status, 'ahead');
		assert.strictEqual(ahead_result.emoji, '🟢');

		// +4.9% buffer => on_track
		const on_track_plus = calculate_weekly_pace(0.549, half_week);
		assert.ok(on_track_plus);
		assert.strictEqual(on_track_plus.status, 'on_track');
		assert.strictEqual(on_track_plus.emoji, '🟡');

		// -4.9% buffer => on_track
		const on_track_minus = calculate_weekly_pace(0.451, half_week);
		assert.ok(on_track_minus);
		assert.strictEqual(on_track_minus.status, 'on_track');
		assert.strictEqual(on_track_minus.emoji, '🟡');

		// Exactly -5.0% buffer => behind
		const behind_result = calculate_weekly_pace(0.45, half_week);
		assert.ok(behind_result);
		assert.strictEqual(behind_result.status, 'behind');
		assert.strictEqual(behind_result.emoji, '🔴');
	});

	it('should apply exhaustion guard: remaining 0% is always behind pace', () => {
		// 1 hour remaining near end of cycle => target = (1 / 168) * 100 = ~0.60%
		const one_hour = 60 * 60 * 1000;
		// Remaining = 0% => buffer would mathematically be -0.60% (which would fall in [-5%, +5%])
		// Without guard, this would incorrectly be labeled 'on_track' (🟡)
		const result = calculate_weekly_pace(0.0, one_hour);
		assert.ok(result);
		assert.strictEqual(result.status, 'behind');
		assert.strictEqual(result.emoji, '🔴');
	});

	it('should apply full quota guard: 100% remaining is always ahead of pace (🟢)', () => {
		// Just after reset (167.9 hours remaining, target ~99.9%)
		// Without full quota guard, 100% remaining would have buffer +0.1% and be incorrectly labeled 'on_track' (🟡)
		const almost_full_week = WEEKLY_CYCLE_MS - 60000;
		const result = calculate_weekly_pace(1.0, almost_full_week);
		assert.ok(result);
		assert.strictEqual(result.status, 'ahead');
		assert.strictEqual(result.emoji, '🟢');
	});

	it('should scale ahead threshold near cycle start when target > 95%', () => {
		// Target = 98% (achievable headroom = 2%). User has 99% remaining (buffer = +1%).
		// Standard 5% threshold would label this 'on_track', but with scaling it is 'ahead' (🟢)
		const time_remain = (98 / 100) * WEEKLY_CYCLE_MS;
		const result = calculate_weekly_pace(0.99, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'ahead');
		assert.strictEqual(result.emoji, '🟢');
	});

	it('should clamp remaining time when expired (time <= 0)', () => {
		// Cycle expired, target = 0%
		const result = calculate_weekly_pace(0.1, -5000);
		assert.ok(result);
		assert.strictEqual(result.target_quota_percentage, 0);
		assert.strictEqual(result.status, 'ahead');
		assert.strictEqual(result.emoji, '🟢');
	});

	it('should clamp remaining time when beyond weekly cycle (time > WEEKLY_CYCLE_MS)', () => {
		// Over 7 days => target clamped to 100%
		const result = calculate_weekly_pace(0.9, WEEKLY_CYCLE_MS + 100000);
		assert.ok(result);
		assert.strictEqual(result.target_quota_percentage, 100);
		assert.strictEqual(result.buffer_percentage, -10);
		assert.strictEqual(result.status, 'behind');
	});
});

describe('StatusBar - format_group_status with pace indicator', () => {
	const mock_group: quota_group_info = {
		display_name: 'Claude and GPT models',
		buckets: [
			{
				bucket_id: '5h',
				display_name: 'Five Hour',
				window: '5h',
				remaining_fraction: 0.95,
				remaining_percentage: 95,
				is_exhausted: false,
				reset_time: new Date(),
				time_until_reset: 2 * 60 * 60 * 1000,
				time_until_reset_formatted: '2h',
			},
			{
				bucket_id: 'weekly',
				display_name: 'Weekly',
				window: 'weekly',
				remaining_fraction: 0.8,
				remaining_percentage: 80,
				is_exhausted: false,
				reset_time: new Date(),
				time_until_reset: 4 * 24 * 60 * 60 * 1000, // 4 days left => ahead (🟢)
				time_until_reset_formatted: '4d',
			},
		],
	};

	it('should append pace emoji badge when show_pace_indicator is true', () => {
		const text = format_group_status(mock_group, true);
		assert.ok(text.includes('1w: 80%🟢'), `Expected text to include '1w: 80%🟢', got: ${text}`);
		assert.ok(text.includes('5h: 95%'));
	});

	it('should omit pace emoji badge when show_pace_indicator is false', () => {
		const text = format_group_status(mock_group, false);
		assert.ok(text.includes('1w: 80%'), `Expected text to include '1w: 80%', got: ${text}`);
		assert.ok(!text.includes('🟢'), `Expected text not to include '🟢', got: ${text}`);
	});

	it('should always render 5h before weekly regardless of input bucket order', () => {
		// Reverse order: weekly first, 5h second
		const reverse_group: quota_group_info = {
			display_name: 'Claude and GPT models',
			buckets: [
				mock_group.buckets[1], // weekly
				mock_group.buckets[0], // 5h
			],
		};
		const text = format_group_status(reverse_group, true);
		assert.ok(text.includes('[5h: 95% | 1w: 80%🟢]'), `Expected 5h before weekly, got: ${text}`);
	});

	it('should sort buckets with shorter windows first via sort_buckets', () => {
		const unsorted: quota_bucket_info[] = [
			{ ...mock_group.buckets[1] }, // weekly
			{ ...mock_group.buckets[0] }, // 5h
		];
		const sorted = sort_buckets(unsorted);
		assert.strictEqual(sorted[0].window, '5h');
		assert.strictEqual(sorted[1].window, 'weekly');
	});
});

describe('StatusBar - build_tooltip', () => {
	const status_bar = new StatusBarManager();

	const mock_snapshot: quota_snapshot = {
		timestamp: new Date(),
		models: [],
		groups: [
			{
				display_name: 'Claude and GPT models',
				buckets: [
					{
						bucket_id: '5h',
						display_name: 'Five Hour',
						window: '5h',
						remaining_fraction: 0.95,
						remaining_percentage: 95,
						is_exhausted: false,
						reset_time: new Date(),
						time_until_reset: 2 * 60 * 60 * 1000,
						time_until_reset_formatted: '2h',
					},
					{
						bucket_id: 'weekly',
						display_name: 'Weekly',
						window: 'weekly',
						remaining_fraction: 0.8,
						remaining_percentage: 80,
						is_exhausted: false,
						reset_time: new Date(),
						time_until_reset: 4 * 24 * 60 * 60 * 1000,
						time_until_reset_formatted: '4d',
					},
				],
			},
		],
	};

	it('should build rich markdown tooltip containing weekly pace breakdown', () => {
		const tooltip = status_bar.build_tooltip(mock_snapshot, true);
		const md_value = tooltip.value;

		assert.ok(md_value.includes('Antigravity Quota Details'));
		assert.ok(md_value.includes('Claude and GPT models (Claude/GPT)'));
		assert.ok(md_value.includes('Weekly'));
		assert.ok(md_value.includes('🟢 **Ahead of pace**'));
		assert.ok(md_value.includes('Target Quota: 57.1%'));
		assert.ok(md_value.includes('+23% buffer'));
	});
});
