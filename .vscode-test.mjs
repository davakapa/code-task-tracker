import { defineConfig } from '@vscode/test-cli';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Короткий отдельный профиль: на macOS путь IPC ограничен по длине.
const profile = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'codetask-'));
export default defineConfig({
	files: 'out/test/**/*.test.js',
	useInstallation: process.env.VSCODE_EXECUTABLE ? { fromPath: process.env.VSCODE_EXECUTABLE } : undefined,
	launchArgs: ['--user-data-dir=' + profile, '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
	mocha: { timeout: 10000 },
});
