import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
	calculate_weekly_pace,
	WEEKLY_CYCLE_MS,
	PACE_CRITICAL_THRESHOLD,
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

	it('should identify ahead of pace when at or above linear target (buffer >= 0%)', () => {
		// 4 days left out of 7 days => target = (4/7) * 100 = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 80% => buffer = 80 - 57.14 = +22.86%
		const result = calculate_weekly_pace(0.8, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'ahead');
		assert.strictEqual(result.emoji, '🟢');
		assert.strictEqual(Math.round(result.buffer_percentage), 23);
		assert.strictEqual(Math.round(result.target_quota_percentage), 57);

		// Quota remaining = 58% => buffer = +0.86% (ahead of linear target)
		const on_target = calculate_weekly_pace(0.58, time_remain);
		assert.ok(on_target);
		assert.strictEqual(on_target.status, 'ahead');
		assert.strictEqual(on_target.emoji, '🟢');
	});

	it('should identify on track / caution when slightly below target (-10% <= buffer < 0%)', () => {
		// 4 days left => target = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 52% => buffer = 52 - 57.14 = -5.14% (warning/caution)
		const result = calculate_weekly_pace(0.52, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'on_track');
		assert.strictEqual(result.emoji, '🟡');
		assert.strictEqual(Math.round(result.buffer_percentage), -5);
	});

	it('should identify behind pace when significantly below target (buffer < -10%)', () => {
		// 4 days left => target = ~57.14%
		const time_remain = 4 * 24 * 60 * 60 * 1000;
		// Quota remaining = 45% => buffer = 45 - 57.14 = -12.14%
		const result = calculate_weekly_pace(0.45, time_remain);
		assert.ok(result);
		assert.strictEqual(result.status, 'behind');
		assert.strictEqual(result.emoji, '🔴');
		assert.strictEqual(Math.round(result.buffer_percentage), -12);
	});

	it('should handle boundary values (0.0% and -10.0%)', () => {
		const half_week = WEEKLY_CYCLE_MS / 2; // target = 50%

		// Exactly 0.0% buffer (50% remaining) => ahead
		const exactly_target = calculate_weekly_pace(0.5, half_week);
		assert.ok(exactly_target);
		assert.strictEqual(exactly_target.status, 'ahead');
		assert.strictEqual(exactly_target.emoji, '🟢');

		// -0.01% buffer (49.99% remaining) => on_track
		const slightly_below = calculate_weekly_pace(0.4999, half_week);
		assert.ok(slightly_below);
		assert.strictEqual(slightly_below.status, 'on_track');
		assert.strictEqual(slightly_below.emoji, '🟡');

		// Exactly -10.0% buffer (40% remaining) => on_track
		const critical_boundary = calculate_weekly_pace(0.4, half_week);
		assert.ok(critical_boundary);
		assert.strictEqual(critical_boundary.status, 'on_track');
		assert.strictEqual(critical_boundary.emoji, '🟡');

		// -10.01% buffer (39.99% remaining) => behind
		const below_critical = calculate_weekly_pace(0.3999, half_week);
		assert.ok(below_critical);
		assert.strictEqual(below_critical.status, 'behind');
		assert.strictEqual(below_critical.emoji, '🔴');
	});

	it('should apply exhaustion guard: remaining 0% is always behind pace', () => {
		// 1 hour remaining near end of cycle => target = (1 / 168) * 100 = ~0.60%
		const one_hour = 60 * 60 * 1000;
		// Remaining = 0% => mathematically buffer would be -0.60% (-10% <= buffer < 0)
		// Exhaustion guard ensures depleted quota is immediately labeled behind (🔴)
		const result = calculate_weekly_pace(0.0, one_hour);
		assert.ok(result);
		assert.strictEqual(result.status, 'behind');
		assert.strictEqual(result.emoji, '🔴');
	});

	it('should handle unused 100% quota as ahead (🟢) at any point in the cycle', () => {
		// Just after reset (167.9 hours remaining, target ~99.9%)
		const almost_full_week = WEEKLY_CYCLE_MS - 60000;
		const start_result = calculate_weekly_pace(1.0, almost_full_week);
		assert.ok(start_result);
		assert.strictEqual(start_result.status, 'ahead');
		assert.strictEqual(start_result.emoji, '🟢');

		// Mid-week (target 50%)
		const mid_result = calculate_weekly_pace(1.0, WEEKLY_CYCLE_MS / 2);
		assert.ok(mid_result);
		assert.strictEqual(mid_result.status, 'ahead');
		assert.strictEqual(mid_result.emoji, '🟢');
	});

	it('should accurately handle Day 1 consumption pace (1 day elapsed = target ~85.7%)', () => {
		// 6 days left (24h elapsed) => target = (6/7) * 100 = 85.71%
		const six_days = 6 * 24 * 60 * 60 * 1000;

		// Used 10% on Day 1 (90% left) => 90% >= 85.71% => Ahead (🟢)
		const healthy_day1 = calculate_weekly_pace(0.9, six_days);
		assert.ok(healthy_day1);
		assert.strictEqual(healthy_day1.status, 'ahead');
		assert.strictEqual(healthy_day1.emoji, '🟢');

		// Overused on Day 1 (80% left) => 80% < 85.71% (-5.71% buffer) => Caution (🟡)
		const overused_day1 = calculate_weekly_pace(0.8, six_days);
		assert.ok(overused_day1);
		assert.strictEqual(overused_day1.status, 'on_track');
		assert.strictEqual(overused_day1.emoji, '🟡');

		// Burned heavily on Day 1 (70% left) => 70% - 85.71% = -15.71% => Critical (🔴)
		const heavy_day1 = calculate_weekly_pace(0.7, six_days);
		assert.ok(heavy_day1);
		assert.strictEqual(heavy_day1.status, 'behind');
		assert.strictEqual(heavy_day1.emoji, '🔴');
	});

	it('should guarantee strictly monotonic transitions (green -> yellow -> red) as quota depletes', () => {
		const fixed_time = 3 * 24 * 60 * 60 * 1000; // 3 days left => target ~42.86%
		let seen_yellow = false;
		let seen_red = false;

		// Decrease quota from 100% down to 0% in 1% steps
		for (let pct = 100; pct >= 0; pct--) {
			const res = calculate_weekly_pace(pct / 100, fixed_time);
			assert.ok(res);

			if (res.status === 'on_track') {
				seen_yellow = true;
			} else if (res.status === 'behind') {
				seen_red = true;
			}

			// If we have transitioned to yellow, we must never see green again
			if (seen_yellow && !seen_red) {
				assert.notStrictEqual(res.status, 'ahead', `Unexpected transition back to green at ${pct}%`);
			}
			// If we have transitioned to red, we must never see green or yellow again
			if (seen_red) {
				assert.strictEqual(res.status, 'behind', `Unexpected transition out of red at ${pct}%`);
			}
		}

		assert.ok(seen_yellow, 'Should have transitioned through yellow');
		assert.ok(seen_red, 'Should have transitioned through red');
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
		const result = calculate_weekly_pace(0.85, WEEKLY_CYCLE_MS + 100000);
		assert.ok(result);
		assert.strictEqual(result.target_quota_percentage, 100);
		assert.strictEqual(result.buffer_percentage, -15);
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
		assert.ok(md_value.includes('Pace: 🟢 **Ahead of pace** (+23% buffer)'));
		assert.ok(md_value.includes('Target Quota: 57.1%'));
		assert.ok(md_value.includes('+23% buffer'));
	});
});
