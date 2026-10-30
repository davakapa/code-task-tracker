import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { CommentTask } from '../taskParser';

suite('CodeTask Tracker: текущий файл', () => {
	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	});

	test('команда активируется и читает несохранённый C++ документ', async () => {
		const doc = await vscode.workspace.openTextDocument({language: 'cpp', content: '// TODO[HIGH]: починить\nconst char* s = "// BUG: не задача";'});
		const editor = await vscode.window.showTextDocument(doc);
		let tasks = await vscode.commands.executeCommand<CommentTask[]>('code-task-tracker.scanCurrentFile');
		assert.equal(tasks?.length, 1);
		assert.equal(tasks?.[0].priority, 'HIGH');
		assert.equal(tasks?.[0].offset, 3);
		await editor.edit(edit => edit.insert(doc.positionAt(doc.getText().length), '\n// NOTE[LOW]: новая'));
		tasks = await vscode.commands.executeCommand<CommentTask[]>('code-task-tracker.scanCurrentFile');
		assert.deepEqual(tasks?.map(task => task.type), ['TODO', 'NOTE']);
	});

	test('неподдерживаемый язык не выдаёт ложные задачи', async () => {
		const doc = await vscode.workspace.openTextDocument({language: 'plaintext', content: '// TODO: это текст'});
		await vscode.window.showTextDocument(doc);
		assert.deepEqual(await vscode.commands.executeCommand('code-task-tracker.scanCurrentFile'), []);
	});

	test('пустой файл возвращает пустой список', async () => {
		const doc = await vscode.workspace.openTextDocument({language: 'c', content: ''});
		await vscode.window.showTextDocument(doc);
		assert.deepEqual(await vscode.commands.executeCommand('code-task-tracker.scanCurrentFile'), []);
	});
});
