/**
 * Pace Calculator Service
 *
 * Evaluates weekly quota consumption pace against the linear burn-rate target.
 */

import {weekly_pace_info} from '../utils/types';

/** Total milliseconds in a 7-day weekly cycle */
export const WEEKLY_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Buffer percentage threshold for ahead/behind pace determination (+/- 5%) */
export const PACE_BUFFER_THRESHOLD = 5.0;

/**
 * Calculate weekly quota pace info comparing remaining quota fraction to linear target.
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

	// Full quota guard: 100% remaining means zero quota used, always ahead of pace
	if (remaining_fraction >= 1.0) {
		return {
			status: 'ahead',
			emoji: '🟢',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	// Near-full ceiling: if remaining quota is >= 95% and at or above linear target,
	// user is in a safe surplus state (resolves the 100% ceiling limitation near cycle start).
	if (current_quota_percentage >= 95 && buffer_percentage >= 0) {
		return {
			status: 'ahead',
			emoji: '🟢',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	if (buffer_percentage >= PACE_BUFFER_THRESHOLD) {
		return {
			status: 'ahead',
			emoji: '🟢',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	if (buffer_percentage <= -PACE_BUFFER_THRESHOLD) {
		return {
			status: 'behind',
			emoji: '🔴',
			buffer_percentage,
			target_quota_percentage,
		};
	}

	return {
		status: 'on_track',
		emoji: '🟡',
		buffer_percentage,
		target_quota_percentage,
	};
}
