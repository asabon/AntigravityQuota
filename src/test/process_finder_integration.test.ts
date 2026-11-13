import './setup';
import {describe, it, afterEach} from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {spawn, ChildProcess, exec} from 'node:child_process';
import {promisify} from 'node:util';
import {WindowsStrategy, UnixStrategy, platform_strategy} from '../core/platform_strategies';

const exec_async = promisify(exec);

describe('ProcessFinder Native Integration', () => {
	let cleanup_tasks: (() => Promise<void>)[] = [];

	afterEach(async () => {
		for (const task of cleanup_tasks) {
			try {
				await task();
			} catch {
				// ignore cleanup errors
			}
		}
		cleanup_tasks = [];
	});

	/**
	 * Helper to spawn a mock backend process with a specific binary name and arguments.
	 */
	async function spawn_mock_backend(
		binary_name: string,
		args: string[]
	): Promise<{child: ChildProcess; port: number}> {
		const tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agq_mock_'));
		const binary_path = path.join(tmp_dir, binary_name);

		// Copy current node binary to simulate the target process name (e.g. agy.exe or language_server)
		fs.copyFileSync(process.execPath, binary_path);

		const fixture_path = path.resolve(__dirname, 'fixtures/mock_backend.js');

		const child = spawn(binary_path, [fixture_path, ...args], {
			stdio: ['pipe', 'pipe', 'inherit'],
			windowsHide: true,
		});

		cleanup_tasks.push(async () => {
			if (!child.killed) {
				child.kill('SIGTERM');
			}
			// Wait a bit before deleting binary to allow OS to release file handle
			await new Promise(r => setTimeout(r, 200));
			try {
				fs.rmSync(tmp_dir, {recursive: true, force: true});
			} catch {
				// ignore on Windows if lock is briefly retained
			}
		});

		const port = await new Promise<number>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Timeout waiting for mock backend READY signal'));
			}, 10000);

			let buffer = '';
			child.stdout?.on('data', (data: Buffer) => {
				buffer += data.toString();
				const match = buffer.match(/READY:(\d+)/);
				if (match) {
					clearTimeout(timeout);
					resolve(parseInt(match[1], 10));
				}
			});

			child.on('error', (err) => {
				clearTimeout(timeout);
				reject(err);
			});

			child.on('exit', (code) => {
				clearTimeout(timeout);
				reject(new Error(`Mock backend exited prematurely with code ${code}`));
			});
		});

		return {child, port};
	}

	function get_current_strategy(): platform_strategy {
		if (process.platform === 'win32') {
			return new WindowsStrategy();
		} else if (process.platform === 'darwin') {
			return new UnixStrategy('darwin');
		} else {
			return new UnixStrategy('linux');
		}
	}

	it('should detect modern agy process and discover its listening port via native OS commands', async () => {
		const is_win = process.platform === 'win32';
		const binary_name = is_win ? 'agy.exe' : 'agy';
		const expected_csrf = 'test-modern-csrf-12345';
		const expected_ext_port = 54321;

		const {child, port: listening_port} = await spawn_mock_backend(binary_name, [
			'--hub',
			`--hub-port=${expected_ext_port}`,
			`--csrf_token=${expected_csrf}`,
			'--app_data_dir=antigravity',
		]);

		assert.ok(child.pid, 'Child process must have a PID');
		assert.ok(listening_port > 0, 'Mock backend must listen on a valid port');

		const strategy = get_current_strategy();
		const list_cmd = strategy.get_process_list_command([binary_name]);

		// 1. Process discovery test
		const {stdout: proc_stdout} = await exec_async(list_cmd);
		const candidates = strategy.parse_process_info(proc_stdout);

		assert.ok(candidates, 'Candidates must not be null');
		const matched = candidates.find(c => c.pid === child.pid);
		assert.ok(matched, `Process with PID ${child.pid} must be discovered`);
		assert.strictEqual(matched?.extension_port, expected_ext_port);
		assert.strictEqual(matched?.csrf_token, expected_csrf);

		// 2. Port discovery test
		const port_cmd = strategy.get_port_list_command(child.pid);
		const {stdout: port_stdout} = await exec_async(port_cmd);
		const discovered_ports = strategy.parse_listening_ports(port_stdout, child.pid);

		assert.ok(
			discovered_ports.includes(listening_port),
			`Listening port ${listening_port} must be discovered in [${discovered_ports.join(', ')}]`
		);
	});

	it('should detect legacy language_server process and discover its listening port via native OS commands', async () => {
		const is_win = process.platform === 'win32';
		const binary_name = is_win ? 'language_server_windows_x64.exe' : 'language_server';
		const expected_csrf = 'test-legacy-csrf-67890';
		const expected_ext_port = 50000;

		const {child, port: listening_port} = await spawn_mock_backend(binary_name, [
			'--extension_server_port',
			`${expected_ext_port}`,
			`--csrf_token=${expected_csrf}`,
			'--app_data_dir',
			'antigravity',
		]);

		assert.ok(child.pid, 'Child process must have a PID');
		assert.ok(listening_port > 0, 'Mock backend must listen on a valid port');

		const strategy = get_current_strategy();
		const list_cmd = strategy.get_process_list_command([binary_name]);

		// 1. Process discovery test
		const {stdout: proc_stdout} = await exec_async(list_cmd);
		const candidates = strategy.parse_process_info(proc_stdout);

		assert.ok(candidates, 'Candidates must not be null');
		const matched = candidates.find(c => c.pid === child.pid);
		assert.ok(matched, `Legacy process with PID ${child.pid} must be discovered`);
		assert.strictEqual(matched?.extension_port, expected_ext_port);
		assert.strictEqual(matched?.csrf_token, expected_csrf);

		// 2. Port discovery test
		const port_cmd = strategy.get_port_list_command(child.pid);
		const {stdout: port_stdout} = await exec_async(port_cmd);
		const discovered_ports = strategy.parse_listening_ports(port_stdout, child.pid);

		assert.ok(
			discovered_ports.includes(listening_port),
			`Listening port ${listening_port} must be discovered in [${discovered_ports.join(', ')}]`
		);
	});
});
