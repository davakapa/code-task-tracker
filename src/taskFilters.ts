import type { CommentTask, TaskPriority, TaskType } from './taskParser';

export interface TaskFilters {
	types: TaskType[];
	priorities: TaskPriority[];
	fileQuery: string;
	textQuery: string;
}

export function defaultFilters(): TaskFilters {
	return { types: [], priorities: [], fileQuery: '', textQuery: '' };
}

export function hasFilters(filters: TaskFilters): boolean {
	return filters.types.length > 0 || filters.priorities.length > 0 ||
		filters.fileQuery.length > 0 || filters.textQuery.length > 0;
}

/** Между условиями — И. Внутри списка типов/приоритетов — ИЛИ. */
export function matchesFilters(task: CommentTask, relativePath: string, filters: TaskFilters): boolean {
	return (filters.types.length === 0 || filters.types.includes(task.type)) &&
		(filters.priorities.length === 0 || filters.priorities.includes(task.priority)) &&
		relativePath.toLowerCase().includes(filters.fileQuery.trim().toLowerCase()) &&
		task.message.toLowerCase().includes(filters.textQuery.trim().toLowerCase());
}

export function describeFilters(filters: TaskFilters): string {
	const parts: string[] = [];
	if (filters.types.length) {
		parts.push(`Тип: ${filters.types.join(', ')}`);
	}
	if (filters.priorities.length) {
		parts.push(`Приоритет: ${filters.priorities.join(', ')}`);
	}
	if (filters.fileQuery) {
		parts.push(`Файл: ${filters.fileQuery}`);
	}
	if (filters.textQuery) {
		parts.push(`Текст: ${filters.textQuery}`);
	}
	return parts.join(' · ');
}
