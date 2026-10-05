/**
 * Pace Calculator Service
 *
 * Evaluates weekly quota consumption pace against the linear burn-rate target.
 */

import {weekly_pace_info} from '../utils/types';

/** Total milliseconds in a 7-day weekly cycle */
export const WEEKLY_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Buffer percentage threshold below which pace is critically behind (-10%) */
export const PACE_CRITICAL_THRESHOLD = -10.0;

/** Backward-compatible alias for buffer threshold */
export const PACE_BUFFER_THRESHOLD = 10.0;

/**
 * Calculate weekly quota pace info comparing remaining quota fraction to linear target.
 *
 * Determination criteria (guarantees monotonic green -> yellow -> red transitions):
 * - Exhausted (0%): Immediately 🔴 Behind
 * - Buffer >= 0%: 🟢 Ahead (at or above linear burn-rate target, safe surplus)
 * - -10% <= Buffer < 0%: 🟡 On Track / Caution (slightly burning faster than linear target)
 * - Buffer < -10%: 🔴 Behind / Critical (significantly ahead of burn rate, high risk of exhaustion)
 *
 * @param remaining_fraction Remaining quota as fraction between 0.0 and 1.0 (undefined if unknown)
 * @param time_until_reset_ms Milliseconds remaining until weekly quota resets
 * @returns weekly_pace_info with status, badge emoji, buffer percentage, and target linear quota
 */
export function calculate_weekly_pace(
	remaining_fraction: number | undefined,
	time_until_reset_ms: number
): weekly_pace_info | null {
	if (remaining_fraction === undefined) {
		return null;
	}

	// Clamp remaining time between 0 and full cycle duration
	const clamped_remain_ms = Math.max(0, Math.min(WEEKLY_CYCLE_MS, time_until_reset_ms));
	const time_ratio = clamped_remain_ms / WEEKLY_CYCLE_MS;
	const target_quota_percentage = time_ratio * 100;
	const current_quota_percentage = remaining_fraction * 100;
	const buffer_percentage = current_quota_percentage - target_quota_percentage;

	// Exhaustion guard: if completely depleted, override to behind pace immediately
	if (remaining_fraction === 0) {
		return {
			status: 'behind',
			emoji: '🔴',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	// At or above linear target: safe surplus (Ahead / Green)
	// Naturally handles 100% unused quota, early week consumption within daily budget, and surplus
	if (buffer_percentage >= 0) {
		return {
			status: 'ahead',
			emoji: '🟢',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	// Substantially below target (< -10%): high exhaustion risk (Behind / Red)
	if (buffer_percentage < PACE_CRITICAL_THRESHOLD) {
		return {
			status: 'behind',
			emoji: '🔴',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	// Slightly below target (-10% <= buffer < 0%): pacing warning (Caution / Yellow)
	return {
		status: 'on_track',
		emoji: '🟡',
		buffer_percentage,
		target_quota_percentage,
	};
}
