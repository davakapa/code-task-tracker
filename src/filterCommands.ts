import * as vscode from 'vscode';
import type { TaskTree } from './taskTree';
import type { TaskPriority, TaskType } from './taskParser';

// Отделяем диалоги VS Code от самой фильтрации.
export async function chooseFilters(tree: TaskTree): Promise<void> {
	const selected = await vscode.window.showQuickPick([
		{ label: 'Тип задачи', id: 'type' },
		{ label: 'Приоритет', id: 'priority' },
		{ label: 'Имя или путь файла', id: 'file' },
		{ label: 'Текст задачи', id: 'text' },
		{ label: 'Сбросить все фильтры', id: 'reset' },
	], { title: 'CodeTask Tracker: фильтры', placeHolder: 'Условия применяются вместе' });
	if (!selected) {
		return;
	}
	const filters = tree.getFilters();
	switch (selected.id) {
		case 'type': {
			const types: TaskType[] = ['TODO', 'FIXME', 'BUG', 'HACK', 'NOTE'];
			const picked = await vscode.window.showQuickPick(types.map(type => ({ label: type, picked: filters.types.includes(type) })), {
				title: 'Типы задач', canPickMany: true, placeHolder: 'Выбери типы; без галочек — все типы',
			});
			if (picked !== undefined) {
				tree.setFilters({ types: picked.map(item => item.label) });
			}
			break;
		}
		case 'priority': {
			const priorities: TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
			const picked = await vscode.window.showQuickPick(priorities.map(priority => ({ label: priority, picked: filters.priorities.includes(priority) })), {
				title: 'Приоритеты задач', canPickMany: true, placeHolder: 'Выбери приоритеты; без галочек — все приоритеты',
			});
			if (picked !== undefined) {
				tree.setFilters({ priorities: picked.map(item => item.label) });
			}
			break;
		}
		case 'file': {
			const value = await vscode.window.showInputBox({ title: 'Фильтр по файлу', prompt: 'Часть имени или пути, без учёта регистра. Пустое поле снимает фильтр.', placeHolder: 'Например: main.cpp или src/', value: filters.fileQuery });
			if (value !== undefined) {
				tree.setFilters({ fileQuery: value });
			}
			break;
		}
		case 'text':
			await searchTasks(tree);
			break;
		case 'reset':
			tree.resetFilters();
			break;
	}
}

export async function searchTasks(tree: TaskTree): Promise<void> {
	const value = await vscode.window.showInputBox({
		title: 'Поиск по тексту задачи', prompt: 'Часть описания, без учёта регистра. Пустое поле снимает поиск.',
		value: tree.getFilters().textQuery,
	});
	if (value !== undefined) {
		tree.setFilters({ textQuery: value });
	}
}
