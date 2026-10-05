/**
 * Config Manager Service
 */

import * as vscode from 'vscode';
import {config_options, display_mode} from '../utils/types';

export class ConfigManager {
	private readonly config_key = 'agq';
	private readonly legacy_config_key = 'agQuota';

	/**
	 * Get full config
	 */
	get_config(): config_options {
		const config = vscode.workspace.getConfiguration(this.config_key);
		const legacy_config = vscode.workspace.getConfiguration(this.legacy_config_key);

		const enabled = config.get<boolean>('enabled') ?? legacy_config.get<boolean>('enabled', true);
		const polling_interval_sec = config.get<number>('pollingInterval') ?? legacy_config.get<number>('pollingInterval', 120);
		const show_prompt_credits = config.get<boolean>('showPromptCredits') ?? legacy_config.get<boolean>('showPromptCredits', false);
		const display_mode = config.get<display_mode>('displayMode', 'models');

		return {
			enabled,
			polling_interval: Math.max(30, polling_interval_sec) * 1000,
			show_prompt_credits,
			display_mode,
		};
	}

	/**
	 * Listen to config changes
	 */
	on_config_change(callback: (config: config_options) => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(this.config_key) || event.affectsConfiguration(this.legacy_config_key)) {
				callback(this.get_config());
			}
		});
	}
}
