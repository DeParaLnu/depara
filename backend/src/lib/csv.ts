// Мінімальний CSV-парсер: лапки, подвійні лапки всередині, \r\n, BOM, роздільник , або ;
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const LESSON_COLUMNS = [
  'group', 'date', 'pair', 'subject', 'type', 'teacher', 'audience', 'subgroup', 'room', 'faculty',
] as const;
const REQUIRED_COLUMNS = ['group', 'date', 'pair', 'subject'];

// CSV з парами -> об'єкти для валідації. Порожні клітинки пропускаємо, значення за замовчуванням ставить валідатор.
export function csvToLessons(text: string): { lessons: Record<string, unknown>[]; errors: string[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { lessons: [], errors: ['CSV порожній'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { lessons: [], errors: [`У CSV немає обов'язкових колонок: ${missing.join(', ')}`] };
  }

  const lessons = rows.slice(1).map((cells) => {
    const lesson: Record<string, unknown> = {};
    for (const col of LESSON_COLUMNS) {
      const idx = header.indexOf(col);
      const value = idx >= 0 ? (cells[idx] ?? '').trim() : '';
      if (value === '') continue;
      lesson[col] = col === 'pair' || col === 'subgroup' ? Number(value) : value;
    }
    return lesson;
  });
  return { lessons, errors: [] };
}
