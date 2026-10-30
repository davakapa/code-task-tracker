import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Короткий отдельный профиль: на macOS путь IPC ограничен по длине.
const profile = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'codetask-'));
const workspace = join(profile, 'workspace');
mkdirSync(workspace);
const workspaceFile = join(profile, 'test.code-workspace');
writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: workspace }] }));
export default defineConfig({
	workspaceFolder: workspaceFile,
	files: 'out/test/**/*.test.js',
	useInstallation: process.env.VSCODE_EXECUTABLE ? { fromPath: process.env.VSCODE_EXECUTABLE } : undefined,
	launchArgs: ['--user-data-dir=' + profile, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust'],
	mocha: { timeout: 10000 },
});
