import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import type { CommentTask } from '../taskParser';
import { defaultFilters, describeFilters, hasFilters, matchesFilters } from '../taskFilters';

const task: CommentTask = { type: 'TODO', priority: 'HIGH', message: 'Исправить авторизацию [user]', offset: 10 };

test('без фильтров видны все задачи', () => {
	assert.equal(hasFilters(defaultFilters()), false);
	assert.equal(matchesFilters(task, 'src/main.cpp', defaultFilters()), true);
});

test('внутри типов и приоритетов действует ИЛИ', () => {
	const filters = { ...defaultFilters(), types: ['TODO', 'BUG'] as const, priorities: ['HIGH', 'LOW'] as const };
	assert.equal(matchesFilters(task, 'main.cpp', { ...filters, types: [...filters.types], priorities: [...filters.priorities] }), true);
	assert.equal(matchesFilters({ ...task, type: 'NOTE' }, 'main.cpp', { ...defaultFilters(), types: ['TODO', 'BUG'] }), false);
	assert.equal(matchesFilters({ ...task, priority: 'MEDIUM' }, 'main.cpp', { ...defaultFilters(), priorities: ['HIGH', 'LOW'] }), false);
});

test('все четыре условия должны выполняться одновременно', () => {
	const filters = { ...defaultFilters(), types: [task.type], priorities: [task.priority], fileQuery: 'src/', textQuery: 'авторизацию' };
	assert.equal(matchesFilters(task, 'src/main.cpp', filters), true);
	assert.equal(matchesFilters(task, 'test/main.cpp', filters), false);
	assert.equal(matchesFilters({ ...task, message: 'Другая задача' }, 'src/main.cpp', filters), false);
	assert.equal(matchesFilters({ ...task, priority: 'LOW' }, 'src/main.cpp', filters), false);
});

test('поиск по пути и тексту не учитывает регистр и внешние пробелы', () => {
	assert.equal(matchesFilters(task, 'Project/SRC/Main.CPP', { ...defaultFilters(), fileQuery: ' src/MAIN ', textQuery: ' ИСПРАВИТЬ ' }), true);
});

test('спецсимволы трактуются буквально, не как регулярное выражение', () => {
	assert.equal(matchesFilters(task, 'src/[demo].cpp', { ...defaultFilters(), fileQuery: '[demo]', textQuery: '[user]' }), true);
	assert.equal(matchesFilters(task, 'src/main.cpp', { ...defaultFilters(), textQuery: '.*' }), false);
});

test('пустые списки снимают ограничение и новые настройки независимы', () => {
	const first = defaultFilters();
	first.types.push('BUG');
	assert.equal(matchesFilters(task, 'main.cpp', first), false);
	assert.equal(matchesFilters(task, 'main.cpp', defaultFilters()), true);
});

test('сводка перечисляет все включённые фильтры', () => {
	assert.equal(describeFilters(defaultFilters()), '');
	assert.equal(describeFilters({ types: ['TODO', 'BUG'], priorities: ['HIGH'], fileQuery: 'src/', textQuery: 'авторизация' }), 'Тип: TODO, BUG · Приоритет: HIGH · Файл: src/ · Текст: авторизация');
});
