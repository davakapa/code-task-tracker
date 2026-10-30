import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FileNode, TaskNode, TaskTree } from '../taskTree';

suite('CodeTask Tracker: дерево проекта', () => {
	let tree: TaskTree;
	let root: vscode.Uri;
	const content = '// TODO[HIGH]: первая\nint main() {\n  // BUG: вторая\n}\n';
	const uri = (name: string) => vscode.Uri.joinPath(root, name);
	const write = (name: string, text: string) => vscode.workspace.fs.writeFile(uri(name), Buffer.from(text));
	const groups = () => tree.getChildren() as FileNode[];
	const group = (name: string) => groups().find(file => file.uri.toString() === uri(name).toString());

	async function waitFor(check: () => boolean) {
		const deadline = Date.now() + 8000;
		while (!check()) {
			if (Date.now() > deadline) {
				assert.fail('Панель не обновилась за 8 секунд: ' + JSON.stringify({ folders: vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()), files: groups().map(file => file.uri.toString()) }));
			}
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}

	suiteSetup(async () => {
		root = vscode.workspace.workspaceFolders![0].uri;
		const extension = vscode.extensions.all.find(item => item.packageJSON.name === 'code-task-tracker');
		assert.ok(extension);
		({ tree } = await extension.activate());
		await write('main.cpp', content);
		await write('other.c', '// NOTE[LOW]: отдельно');
		await write('ignored.js', '// TODO: другой язык');
		await vscode.workspace.fs.createDirectory(uri('node_modules'));
		await write('node_modules/ignored.cpp', '// TODO: зависимость');
		await write('big.cpp', '// TODO: слишком большой\n' + ' '.repeat(1024 * 1024));
		await tree.refresh();
		await waitFor(() => groups().length === 2);
	});

	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
	});

	test('группирует по файлам, пропускает зависимости, большие и неподдерживаемые файлы', () => {
		assert.equal(groups().length, 2);
		const main = group('main.cpp')!;
		assert.equal(tree.getChildren(main).length, 2);
		assert.equal(group('other.c')?.tasks.length, 1);
		assert.equal(tree.getTreeItem(main).description, '2');
		const item = tree.getTreeItem(main.tasks[1]);
		assert.equal(item.label, 'BUG[MEDIUM]: вторая');
		assert.equal(item.description, 'строка 3');
		assert.equal(item.command?.command, 'code-task-tracker.openTask');
		assert.ok(item.iconPath instanceof vscode.ThemeIcon);
	});

	test('нажатие на задачу открывает правильный файл и выделяет метку', async () => {
		const item = tree.getTreeItem(group('main.cpp')!.tasks[1]);
		await vscode.commands.executeCommand(item.command!.command, ...item.command!.arguments!);
		const editor = vscode.window.activeTextEditor!;
		assert.equal(editor.document.uri.toString(), uri('main.cpp').toString());
		assert.equal(editor.selection.start.line, 2);
		assert.equal(editor.selection.start.character, 5);
		assert.equal(editor.document.getText(editor.selection), 'BUG');
	});

	test('несохранённое изменение автоматически обновляет дерево и позицию', async () => {
		const document = await vscode.workspace.openTextDocument(uri('main.cpp'));
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// HACK: новая\n'));
		await waitFor(() => group('main.cpp')?.tasks.length === 3);
		assert.equal(group('main.cpp')!.tasks[2].position.line, 3);
		await vscode.commands.executeCommand('workbench.action.files.revert');
		await waitFor(() => group('main.cpp')?.tasks.length === 2);
	});

	test('создание, переименование и удаление файла автоматически меняют дерево', async () => {
		await write('created.cpp', '// FIXME: добавлено');
		await waitFor(() => Boolean(group('created.cpp')));
		await vscode.workspace.fs.rename(uri('created.cpp'), uri('renamed.cpp'));
		await waitFor(() => !group('created.cpp') && Boolean(group('renamed.cpp')));
		await vscode.workspace.fs.delete(uri('renamed.cpp'));
		await waitFor(() => !group('renamed.cpp'));
	});

	test('устаревший пункт после сдвига строк обновляет список без ошибочного перехода', async () => {
		const oldNode: TaskNode = group('main.cpp')!.tasks[1];
		const document = await vscode.workspace.openTextDocument(uri('main.cpp'));
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '\n'));
		const selection = editor.selection;
		await tree.openTask(oldNode);
		assert.ok(editor.selection.isEqual(selection));
		await waitFor(() => group('main.cpp')?.tasks[1].position.line === 3);
		await vscode.commands.executeCommand('workbench.action.files.revert');
		await waitFor(() => group('main.cpp')?.tasks[1].position.line === 2);
	});

	test('второй корень проекта учитывается и удаляется из результатов', async () => {
		const second = vscode.Uri.joinPath(root, '..', 'second');
		await vscode.workspace.fs.createDirectory(second);
		await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(second, 'main.cpp'), Buffer.from('// TODO: второй корень'));
		assert.ok(vscode.workspace.updateWorkspaceFolders(1, 0, { uri: second, name: 'Second' }));
		await waitFor(() => groups().some(file => file.uri.toString().startsWith(second.toString() + '/')));
		const secondGroup = groups().find(file => file.uri.toString().startsWith(second.toString() + '/'))!;
		assert.equal(tree.getTreeItem(secondGroup).label, 'Second/main.cpp');
		assert.ok(vscode.workspace.updateWorkspaceFolders(1, 1));
		await waitFor(() => !groups().includes(secondGroup) && groups().length === 2);
	});

	test('повторное обновление не дублирует задачи', async () => {
		await vscode.commands.executeCommand('code-task-tracker.refresh');
		await waitFor(() => groups().length === 2);
		assert.equal(groups().flatMap(file => file.tasks).length, 3);
	});
});
