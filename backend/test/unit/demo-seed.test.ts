import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, buildDemoPayload, DEMO_USERS, GROUPS, mondayOf, TEACHERS, UNPUBLISHED_GROUP, WEEKS_AFTER, WEEKS_BEFORE,
} from '../../prisma/seed/demoData';
import { validateImport } from '../../src/lib/scheduleImport';

const NOW = new Date('2026-10-22T10:00:00Z'); // четвер
const payload = buildDemoPayload(NOW);
type L = (typeof payload.lessons)[number];

const slot = (l: L) => `${l.date}|${l.pair}`;
function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

describe('демо-розклад', () => {
  it('проходить ту саму валідацію, що й імпорт (формат, дублі ключа)', () => {
    const checked = validateImport(payload);
    expect(checked.ok, checked.ok ? '' : checked.errors.join('\n')).toBe(true);
  });

  it('покриває тижні від попереднього до третього наступного, лише будні', () => {
    const monday = mondayOf(NOW);
    const dates = payload.lessons.map((l) => Date.parse(`${l.date}T00:00:00Z`));
    expect(Math.min(...dates)).toBeGreaterThanOrEqual(monday - WEEKS_BEFORE * 7 * 86400000);
    expect(Math.max(...dates)).toBeLessThan(monday + (WEEKS_AFTER + 1) * 7 * 86400000);
    for (const d of dates) expect([1, 2, 3, 4, 5]).toContain(new Date(d).getUTCDay());
    const weeks = new Set(dates.map((d) => mondayOf(new Date(d))));
    expect(weeks.size).toBe(WEEKS_BEFORE + 1 + WEEKS_AFTER);
  });

  it('усі посилання на довідники існують: групи, факультети, викладачі, корпуси', () => {
    const groups = new Set(GROUPS.map((g) => g.code));
    const teachers = new Set(TEACHERS.map((t) => t.full_name));
    const buildings = new Set(BUILDINGS.map((b) => b.code));
    const faculties = new Set(payload.faculties.map((f) => f.short_name));
    expect(GROUPS.every((g) => faculties.has(g.faculty))).toBe(true);
    for (const l of payload.lessons) {
      expect(groups.has(l.group), l.group).toBe(true);
      expect(teachers.has(l.teacher!), `${l.subject}: ${l.teacher}`).toBe(true);
      expect(buildings.has(l.room!.slice(l.room!.lastIndexOf('/') + 1)), `${l.subject}: ${l.room}`).toBe(true);
    }
    expect(payload.pair_times.map((p) => p.pair)).toEqual([1, 2, 3, 4, 5]);
    expect(payload.lessons.every((l) => l.pair >= 1 && l.pair <= 5)).toBe(true);
  });

  it('аудиторія не зайнята двома різними парами одночасно (спільна лекція потоку дозволена)', () => {
    for (const [key, ls] of groupBy(payload.lessons.filter((l) => l.room), (l) => `${slot(l)}|${l.room}`)) {
      const distinct = new Set(ls.map((l) => `${l.subject}|${l.teacher}|${l.type}`));
      expect(distinct.size, `${key}: ${[...distinct].join(' ; ')}`).toBe(1);
      if (ls.some((l) => l.type !== 'LECTURE')) {
        expect(new Set(ls.map((l) => `${l.group}|${l.subgroup}`)).size, `${key} зайнята кількома групами`).toBe(1);
      }
    }
  });

  it('викладач не веде дві різні пари одночасно в різних аудиторіях', () => {
    for (const [key, ls] of groupBy(payload.lessons, (l) => `${slot(l)}|${l.teacher}`)) {
      expect(new Set(ls.map((l) => `${l.subject}|${l.room}`)).size, key).toBe(1);
    }
  });

  it('у групи в один час або одна пара на всіх, або по одній на підгрупу', () => {
    for (const [key, ls] of groupBy(payload.lessons, (l) => `${slot(l)}|${l.group}`)) {
      const subgroups = ls.map((l) => l.subgroup);
      if (subgroups.includes(0)) expect(ls.length, key).toBe(1);
      else expect(new Set(subgroups).size, key).toBe(subgroups.length);
    }
  });

  it('лекції йдуть потоком і однакові у груп одного шаблону, практичні й лаби групові', () => {
    for (const l of payload.lessons) {
      expect(l.audience).toBe(l.type === 'LECTURE' ? 'STREAM' : 'GROUP');
      if (l.type === 'LECTURE') expect(l.subgroup).toBe(0);
    }
    const lectures = (code: string) =>
      payload.lessons.filter((l) => l.group === code && l.type === 'LECTURE').map((l) => ({ ...l, group: '' }));
    expect(lectures('ПМІ-12')).toEqual(lectures('ПМІ-11'));
  });

  it('чисельник і знаменник чергуються, кожна група має пари щотижня', () => {
    const bySubjectWeek = (week: number) =>
      new Set(
        payload.lessons
          .filter((l) => l.group === 'ПМІ-11' && l.date >= new Date(mondayOf(NOW) + week * 7 * 86400000).toISOString().slice(0, 10))
          .slice(0, 100)
          .map((l) => `${l.subject}|${l.type}`),
      );
    expect(bySubjectWeek(0).size).toBeGreaterThan(0);
    const weekKey = (w: number) => {
      const from = mondayOf(NOW) + w * 7 * 86400000;
      return payload.lessons
        .filter((l) => l.group === 'ПМІ-11' && Date.parse(l.date) >= from && Date.parse(l.date) < from + 7 * 86400000)
        .map((l) => `${l.date.slice(8)}|${l.pair}|${l.subject}|${l.type}`.replace(/^\d+/, ''))
        .sort()
        .join(';');
    };
    expect(weekKey(0)).not.toBe(weekKey(1));
    expect(weekKey(0)).toBe(weekKey(2));
    for (const g of GROUPS.filter((g) => g.code !== UNPUBLISHED_GROUP)) {
      for (let w = -WEEKS_BEFORE; w <= WEEKS_AFTER; w++) {
        const from = mondayOf(NOW) + w * 7 * 86400000;
        const n = payload.lessons.filter((l) => l.group === g.code && Date.parse(l.date) >= from && Date.parse(l.date) < from + 7 * 86400000).length;
        expect(n, `${g.code}, тиждень ${w}`).toBeGreaterThan(5);
      }
    }
  });

  it('група для екрана «не опубліковано» існує, але пар у неї немає', () => {
    expect(GROUPS.some((g) => g.code === UNPUBLISHED_GROUP)).toBe(true);
    expect(payload.lessons.some((l) => l.group === UNPUBLISHED_GROUP)).toBe(false);
  });

  it('демо-акаунти: домен ЛНУ, групи існують, адміна немає', () => {
    const codes = new Set(GROUPS.map((g) => g.code));
    for (const u of DEMO_USERS) {
      expect(u.email.endsWith('@lnu.edu.ua')).toBe(true);
      expect(u.role).not.toBe('ADMIN');
      if (u.group) expect(codes.has(u.group)).toBe(true);
    }
    expect(new Set(DEMO_USERS.map((u) => u.email)).size).toBe(DEMO_USERS.length);
  });
});
