import * as vscode from 'vscode';

// VS Code вызывает activate при первом обращении к команде расширения.
export function activate(context: vscode.ExtensionContext) {
	// ID должен совпадать с contributes.commands в package.json.
	const command = vscode.commands.registerCommand('code-task-tracker.helloWorld', () => {
		vscode.window.showInformationMessage('CodeTask Tracker запущен!');
	});

	// При отключении расширения VS Code освободит зарегистрированную команду.
	context.subscriptions.push(command);
}

export function deactivate() {}
