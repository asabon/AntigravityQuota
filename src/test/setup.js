// Minimal in-memory mock for 'vscode' in unit test environment
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

const mockVscode = {
	StatusBarAlignment: { Left: 1, Right: 2 },
	QuickPickItemKind: { Separator: -1, Default: 0 },
	ThemeColor: class ThemeColor {
		constructor(id) {
			this.id = id;
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
			get: (key, defaultValue) => defaultValue,
			update: async () => {},
		}),
	},
	commands: {
		registerCommand: () => ({ dispose: () => {} }),
	},
};

Module._resolveFilename = function (request, parent, isMain, options) {
	if (request === 'vscode') {
		return 'vscode';
	}
	return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.cache['vscode'] = {
	id: 'vscode',
	filename: 'vscode',
	loaded: true,
	exports: mockVscode,
};
