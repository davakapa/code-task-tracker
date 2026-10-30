import * as vscode from 'vscode';
import { parseTasks, supportedLanguages } from './taskParser';
import { sourcePattern, TaskNode, TaskTree } from './taskTree';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('CodeTask Tracker');
	const hello = vscode.commands.registerCommand('code-task-tracker.helloWorld', () => {
		vscode.window.showInformationMessage('CodeTask Tracker запущен!');
	});

	const scan = vscode.commands.registerCommand('code-task-tracker.scanCurrentFile', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('Открой файл C или C++, затем повтори поиск.');
			return [];
		}
		const document = editor.document;
		if (!supportedLanguages.includes(document.languageId)) {
			vscode.window.showInformationMessage('На этом этапе поддерживаются файлы C и C++.');
			return [];
		}

		// getText читает и несохранённые правки из редактора.
		const tasks = parseTasks(document.getText());
		output.clear();
		output.appendLine(`Файл: ${document.uri.toString()}`);
		output.appendLine(`Найдено задач: ${tasks.length}`);
		for (const task of tasks) {
			const position = document.positionAt(task.offset);
			output.appendLine(`${position.line + 1}:${position.character + 1} ${task.type}[${task.priority}]: ${task.message}`);
		}
		output.show(true);
		return tasks;
	});

	const tree = new TaskTree(output);
	const view = vscode.window.createTreeView('codeTaskTracker.tasks', { treeDataProvider: tree });
	tree.attachView(view);
	const refresh = vscode.commands.registerCommand('code-task-tracker.refresh', () => tree.refresh());
	const open = vscode.commands.registerCommand('code-task-tracker.openTask', (node: TaskNode) => tree.openTask(node));
	const watcher = vscode.workspace.createFileSystemWatcher(sourcePattern);
	context.subscriptions.push(
		output, hello, scan, tree, view, refresh, open, watcher,
		watcher.onDidCreate(() => tree.scheduleRefresh()),
		watcher.onDidChange(() => tree.scheduleRefresh()),
		watcher.onDidDelete(() => tree.scheduleRefresh()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => tree.scheduleRefresh()),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (supportedLanguages.includes(event.document.languageId)) {
				tree.scheduleRefresh();
			}
		}),
		vscode.workspace.onDidCloseTextDocument(document => {
			if (supportedLanguages.includes(document.languageId)) {
				tree.scheduleRefresh();
			}
		}),
	);
	void tree.refresh();
	return { tree };
}

export function deactivate() {}
