export type TaskType = 'TODO' | 'FIXME' | 'BUG' | 'HACK' | 'NOTE';
export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CommentTask {
	type: TaskType;
	priority: TaskPriority;
	message: string;
	// Позиция метки в исходном тексте. VS Code превратит её в строку и столбец.
	offset: number;
}

// Начальный набор языков: C и C++. Расширять его будем отдельно.
export const supportedLanguages = ['c', 'cpp'];

/** Читает метки только внутри комментариев C/C++, пропуская строки и символы. */
export function parseTasks(source: string): CommentTask[] {
	const tasks: CommentTask[] = [];
	let i = 0;

	function readComment(start: number, end: number) {
		let offset = start;
		for (const line of source.slice(start, end).split('\n')) {
			// Одна задача на строку: // TODO[HIGH]: описание
			const match = /^[\t \r]*\*?[\t ]*(TODO|FIXME|BUG|HACK|NOTE)(?:\[(HIGH|MEDIUM|LOW)\])?[\t ]*:[\t ]*(.*)/.exec(line);
			if (match && match[3].trim()) {
				tasks.push({
					type: match[1] as TaskType,
					priority: (match[2] ?? 'MEDIUM') as TaskPriority,
					message: match[3].trim(),
					offset: offset + line.indexOf(match[1]),
				});
			}
			offset += line.length + 1;
		}
	}

	while (i < source.length) {
		if (source.startsWith('//', i)) {
			const end = source.indexOf('\n', i + 2);
			const limit = end === -1 ? source.length : end;
			readComment(i + 2, limit);
			i = limit;
		} else if (source.startsWith('/*', i)) {
			const end = source.indexOf('*/', i + 2);
			const limit = end === -1 ? source.length : end;
			readComment(i + 2, limit);
			i = end === -1 ? source.length : end + 2;
		} else if (/^(?:u8|u|U|L)?R"/.test(source.slice(i, i + 4))) {
			// C++ raw string: R"tag(текст с кавычками и //)tag".
			const opener = /^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/.exec(source.slice(i, i + 21));
			if (opener) {
				const terminator = `)${opener[1]}"`;
				const end = source.indexOf(terminator, i + opener[0].length);
				i = end === -1 ? source.length : end + terminator.length;
			} else {
				i++;
			}
		} else if (/[a-zA-Z_]/.test(source[i])) {
			i++;
			while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
				i++;
			}
		} else if (/[0-9]/.test(source[i])) {
			// Пропускаем числовой литерал, включая разделители цифр C++.
			i++;
			while (i < source.length && /[a-zA-Z0-9_'.]/.test(source[i])) {
				i++;
			}
		} else if (source[i] === '"' || source[i] === "'") {
			const quote = source[i++];
			while (i < source.length) {
				if (source[i] === '\\') {
					i += 2;
				} else if (source[i++] === quote) {
					break;
				}
			}
		} else {
			i++;
		}
	}
	return tasks;
}
