// Minimal in-memory mock for 'vscode' in unit test environment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

const mockVscode = {
	StatusBarAlignment: { Left: 1, Right: 2 },
	QuickPickItemKind: { Separator: -1, Default: 0 },
	ThemeColor: class ThemeColor {
		constructor(public id: string) {}
	},
	MarkdownString: class MarkdownString {
		public value = '';
		public isTrusted = false;
		public supportThemeIcons = false;
		constructor(value: string = '') {
			this.value = value;
		}
		appendText(value: string) {
			this.value += value;
			return this;
		}
		appendMarkdown(value: string) {
			this.value += value;
			return this;
		}
	},
	window: {
		createStatusBarItem: () => ({
			show: () => {},
			dispose: () => {},
			text: '',
			tooltip: '',
			backgroundColor: undefined,
			command: '',
		}),
		createOutputChannel: () => ({
			appendLine: () => {},
			show: () => {},
		}),
		createQuickPick: () => ({
			show: () => {},
			dispose: () => {},
			onDidChangeActive: () => {},
			onDidAccept: () => {},
			onDidHide: () => {},
			items: [],
		}),
	},
	workspace: {
		getConfiguration: () => ({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			get: (_key: string, defaultValue: any) => defaultValue,
			update: async () => {},
		}),
	},
	commands: {
		registerCommand: () => ({ dispose: () => {} }),
	},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
	if (request === 'vscode') {
		return 'vscode';
	}
	return originalResolveFilename.call(this, request, parent, isMain, options);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
require.cache['vscode'] = {
	id: 'vscode',
	filename: 'vscode',
	loaded: true,
	exports: mockVscode,
} as any;
