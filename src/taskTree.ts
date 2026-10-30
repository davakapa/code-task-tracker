import * as vscode from 'vscode';
import { defaultFilters, describeFilters, hasFilters, matchesFilters, TaskFilters } from './taskFilters';
import { CommentTask, parseTasks, supportedLanguages, TaskType } from './taskParser';

export const sourcePattern = '**/*.{c,h,cc,cpp,cxx,hpp,hh,hxx,C,H}';
const excludedFolders = '**/{.git,node_modules,out,dist,build,.vscode-test}/**';
const maxFileBytes = 1024 * 1024;
const maxFiles = 1000;

export interface TaskNode {
	kind: 'task';
	uri: vscode.Uri;
	task: CommentTask;
	position: vscode.Position;
}

export interface FileNode {
	kind: 'file';
	uri: vscode.Uri;
	tasks: TaskNode[];
}

export type TaskTreeNode = FileNode | TaskNode;

const icons: Record<TaskType, [string, string]> = {
	TODO: ['checklist', 'charts.blue'],
	FIXME: ['tools', 'charts.orange'],
	BUG: ['bug', 'charts.red'],
	HACK: ['wrench', 'charts.purple'],
	NOTE: ['note', 'charts.green'],
};

/** Хранит результаты поиска и отдаёт VS Code дерево «файл → задачи». */
export class TaskTree implements vscode.TreeDataProvider<TaskTreeNode>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;
	private files: FileNode[] = [];
	private visibleFiles: FileNode[] = [];
	private filters = defaultFilters();
	private scanStatus: string | undefined;
	private scanWarnings = '';
	private generation = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private view: vscode.TreeView<TaskTreeNode> | undefined;

	constructor(private readonly output: vscode.OutputChannel) {}

	attachView(view: vscode.TreeView<TaskTreeNode>) {
		this.view = view;
	}

	getChildren(element?: TaskTreeNode): TaskTreeNode[] {
		if (!element) {
			return this.visibleFiles;
		}
		return element.kind === 'file' ? (this.visibleFiles.find(file => file.uri.toString() === element.uri.toString())?.tasks ?? []) : [];
	}

	getTreeItem(element: TaskTreeNode): vscode.TreeItem {
		if (element.kind === 'file') {
			const item = new vscode.TreeItem(vscode.workspace.asRelativePath(element.uri, true), vscode.TreeItemCollapsibleState.Expanded);
			item.id = element.uri.toString();
			item.resourceUri = element.uri;
			item.description = `${element.tasks.length}`;
			item.iconPath = vscode.ThemeIcon.File;
			return item;
		}
		const { task, position } = element;
		const item = new vscode.TreeItem(`${task.type}[${task.priority}]: ${task.message}`);
		item.id = `${element.uri.toString()}#${task.offset}`;
		item.description = `строка ${position.line + 1}`;
		item.tooltip = `${vscode.workspace.asRelativePath(element.uri, true)}:${position.line + 1}:${position.character + 1}\n${task.message}`;
		const [icon, color] = icons[task.type];
		item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
		item.command = { command: 'code-task-tracker.openTask', title: 'Перейти к задаче', arguments: [element] };
		return item;
	}

	// Серия правок запускает один поиск через 300 мс.
	scheduleRefresh() {
		if (this.disposed) {
			return;
		}
		this.generation++;
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => { void this.refresh(); }, 300);
	}

	async refresh(): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		const generation = ++this.generation;
		const isCurrent = () => !this.disposed && generation === this.generation;
		if (!vscode.workspace.workspaceFolders?.length) {
			this.files = [];
			this.scanWarnings = '';
			this.setMessage('Открой папку проекта, чтобы найти задачи C/C++.');
			return;
		}
		this.setMessage('Поиск задач…');
		try {
			const uris = await vscode.workspace.findFiles(sourcePattern, excludedFolders, maxFiles + 1);
			const limited = uris.length > maxFiles;
			const files: FileNode[] = [];
			let skipped = 0;
			for (const uri of uris.slice(0, maxFiles).sort((a, b) => a.toString().localeCompare(b.toString()))) {
				if (!isCurrent()) {
					return;
				}
				try {
					const stat = await vscode.workspace.fs.stat(uri);
					if (stat.size > maxFileBytes) {
						skipped++;
						continue;
					}
					// Возвращает уже открытый документ с несохранёнными изменениями.
					const document = await vscode.workspace.openTextDocument(uri);
					if (!supportedLanguages.includes(document.languageId) || document.getText().length > maxFileBytes) {
						skipped++;
						continue;
					}
					const tasks: TaskNode[] = parseTasks(document.getText()).map(task => ({
						kind: 'task', uri, task, position: document.positionAt(task.offset),
					}));
					if (tasks.length) {
						files.push({ kind: 'file', uri, tasks });
					}
				} catch (error) {
					skipped++;
					this.output.appendLine(`Не удалось прочитать ${uri.toString()}: ${String(error)}`);
				}
			}
			if (!isCurrent()) {
				return;
			}
			this.files = files;
			this.scanWarnings = '';
			if (skipped) {
				this.scanWarnings += ` Пропущено файлов: ${skipped} (размер, язык или ошибка чтения).`;
			}
			if (limited) {
				this.scanWarnings += ` Показаны результаты только первых ${maxFiles} файлов.`;
			}
			this.setMessage(undefined);
		} catch (error) {
			if (isCurrent()) {
				this.files = [];
				this.scanWarnings = '';
				this.setMessage('Не удалось выполнить поиск. Нажми «Обновить задачи».');
				this.output.appendLine(`Ошибка поиска: ${String(error)}`);
			}
		}
	}

	async openTask(node: TaskNode): Promise<void> {
		try {
			const document = await vscode.workspace.openTextDocument(node.uri);
			// Не переходим по устаревшему смещению после редактирования файла.
			const current = parseTasks(document.getText()).find(task =>
				task.offset === node.task.offset && task.type === node.task.type &&
				task.priority === node.task.priority && task.message === node.task.message);
			if (!current) {
				await this.refresh();
				void vscode.window.showInformationMessage('Файл изменился. Список обновлён — выбери задачу снова.');
				return;
			}
			const position = document.positionAt(current.offset);
			const range = new vscode.Range(position, position.translate(0, current.type.length));
			const editor = await vscode.window.showTextDocument(document, { selection: range, preview: true });
			editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		} catch {
			await this.refresh();
			void vscode.window.showInformationMessage('Файл больше недоступен. Список задач обновлён.');
		}
	}

	getFilters(): TaskFilters {
		return { ...this.filters, types: [...this.filters.types], priorities: [...this.filters.priorities] };
	}

	setFilters(update: Partial<TaskFilters>) {
		const filters = { ...this.filters, ...update };
		this.filters = {
			types: [...filters.types], priorities: [...filters.priorities],
			fileQuery: filters.fileQuery.trim(), textQuery: filters.textQuery.trim(),
		};
		this.updateView();
	}

	resetFilters() {
		this.filters = defaultFilters();
		this.updateView();
	}

	private setMessage(message: string | undefined) {
		this.scanStatus = message;
		this.updateView();
	}

	private updateView() {
		// Исходный список остаётся целым: сброс фильтра не требует нового поиска.
		this.visibleFiles = this.files.map(file => ({
			...file,
			tasks: file.tasks.filter(node => matchesFilters(node.task, vscode.workspace.asRelativePath(file.uri, true), this.filters)),
		})).filter(file => file.tasks.length > 0);
		const total = this.files.reduce((sum, file) => sum + file.tasks.length, 0);
		const visible = this.visibleFiles.reduce((sum, file) => sum + file.tasks.length, 0);
		let message = hasFilters(this.filters)
			? (visible ? `Показано задач: ${visible} из ${total}` : `По фильтрам ничего не найдено (всего задач: ${total}). Сбрось или измени фильтры.`)
			: (total ? `Задач: ${total} · файлов с задачами: ${this.files.length}` : 'Задачи C/C++ не найдены.');
		message = (this.scanStatus ?? message) + this.scanWarnings;
		const description = describeFilters(this.filters);
		if (description) {
			message += `\n${description}`;
		}
		if (this.view) {
			this.view.message = message;
			this.view.description = hasFilters(this.filters) ? `${visible}/${total}` : `${total}`;
		}
		this.changed.fire();
	}

	dispose() {
		this.disposed = true;
		this.generation++;
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.changed.dispose();
	}
}
