import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseTasks } from '../taskParser';

test('все типы задач и приоритет по умолчанию', () => {
	const types = ['TODO', 'FIXME', 'BUG', 'HACK', 'NOTE'];
	const tasks = parseTasks(types.map(type => `// ${type}: описание`).join('\n'));
	assert.deepEqual(tasks.map(task => task.type), types);
	assert.ok(tasks.every(task => task.priority === 'MEDIUM'));
});

test('три явных приоритета', () => {
	const tasks = parseTasks('// TODO[HIGH]: а\n// NOTE[LOW]: б\n// BUG[MEDIUM]: в');
	assert.deepEqual(tasks.map(task => task.priority), ['HIGH', 'LOW', 'MEDIUM']);
});

test('точные позиции при CRLF, табуляции и Unicode', () => {
	const source = 'int x;\r\n\t// TODO[HIGH]: починить 🐛\r\n';
	assert.deepEqual(parseTasks(source), [{type: 'TODO', priority: 'HIGH', message: 'починить 🐛', offset: source.indexOf('TODO')}]);
});

test('комментарии после кода и многострочные комментарии', () => {
	const source = 'int x; /* NOTE: один */ int y; // FIXME: два\n/*\n * BUG[HIGH]: три\n * HACK: четыре\n */';
	const tasks = parseTasks(source);
	assert.deepEqual(tasks.map(task => task.message), ['один', 'два', 'три', 'четыре']);
	assert.ok(tasks.every(task => source.slice(task.offset).startsWith(task.type)));
});

test('строки, экранированные кавычки и символьные литералы не дают задач', () => {
	const source = String.raw`const char* s = "\" // TODO: нет"; char c = '\''; // NOTE: да`;
	assert.deepEqual(parseTasks(source).map(task => task.message), ['да']);
});

test('многострочные raw strings с собственным разделителем', () => {
	const source = 'auto s = u8R"tag("\n// TODO: нет\n/* BUG: нет */)tag"; // NOTE: да';
	assert.deepEqual(parseTasks(source).map(task => task.message), ['да']);
});

test('разделитель цифр и case без пробела перед символом', () => {
	const source = "int n = 1'000; // TODO: один\ncase'a': // BUG: два\nint h = 0xFF'AB; // NOTE: три";
	assert.deepEqual(parseTasks(source).map(task => task.message), ['один', 'два', 'три']);
});

test('обычный текст, неверные метки и пустые описания игнорируются', () => {
	assert.deepEqual(parseTasks('TODO: не комментарий\n// todo: малые буквы\n// TODOLOGY: нет\n// TODO[URGENT]: нет\n// TODO:   \n// это NOTE: просто текст'), []);
});

test('незакрытый комментарий при редактировании и конец без новой строки', () => {
	assert.deepEqual(parseTasks('/* TODO: ещё пишем').map(task => task.message), ['ещё пишем']);
	assert.equal(parseTasks('// BUG: конец')[0].message, 'конец');
});

test('маркеры комментариев внутри комментария не меняют состояние', () => {
	assert.equal(parseTasks('// NOTE: здесь /* просто текст\n// TODO: дальше').length, 2);
	assert.equal(parseTasks('/* NOTE: здесь // текст */ // TODO: дальше').length, 2);
});

test('последовательные запуски не сохраняют старые результаты', () => {
	assert.equal(parseTasks('// TODO: первый').length, 1);
	assert.deepEqual(parseTasks(''), []);
});
