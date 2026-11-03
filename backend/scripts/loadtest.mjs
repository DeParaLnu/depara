#!/usr/bin/env node
// Навантажувальний тест типового сценарію студента: відкрити застосунок (/me, розклад тижня), далі час від часу
// оновити розклад (з If-None-Match, як мобільний) і поштукати аудиторію. Без залежностей, лише Node 22.
//
// ПОТРІБЕН сервер у тестовому режимі (фейковий вхід): NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=e2e.admin@lnu.edu.ua
// і підняті ліміти входу та імпорту: RATE_LIMIT_AUTH_PER_MINUTE=100000 RATE_LIMIT_IMPORT_PER_MINUTE=1000.
// НЕ запускайте проти проду: тест створює користувачів і групи. Для проду беріть окремий тестовий стенд.
//
//   node scripts/loadtest.mjs [--base http://localhost:3000] [--users 300] [--duration 30] [--think 1500] [--groups 100]
//
// --users     скільки «студентів» одночасно
// --duration  скільки секунд ганяти сценарій
// --think     середня пауза між діями одного студента, мс (реальний студент робить дію раз на кілька секунд)
// --groups    скільки груп із розкладом створити (по ~100 пар на групу); 0 = лише наявні дані
// --max-p95   поріг p95 розкладу тижня, мс: перевищення дає код виходу 1 (за замовчуванням 300)
//
// Клієнт крутиться на тій самій машині, що й сервер, і конкурує з ним за процесор: цифри консервативні.
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3000' },
    users: { type: 'string', default: '300' },
    duration: { type: 'string', default: '30' },
    think: { type: 'string', default: '1500' },
    groups: { type: 'string', default: '100' },
    'max-p95': { type: 'string', default: '300' },
  },
});
const BASE = opt.base.replace(/\/$/, '');
const USERS = Number(opt.users);
const DURATION_MS = Number(opt.duration) * 1000;
const THINK_MS = Number(opt.think);
const GROUPS = Number(opt.groups);
const MAX_P95 = Number(opt['max-p95']);
const DEVICE = 'loadtest-device';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.5 + Math.random());
const mondayOf = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};
const iso = (d) => d.toISOString().slice(0, 10);

async function api(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function login(email) {
  const res = await api('POST', '/auth/microsoft', { body: { idToken: `test:${email}`, deviceId: DEVICE } });
  if (res.status !== 200) throw new Error(`вхід ${email} дав ${res.status}: ${await res.text()} (потрібен AUTH_MODE=fake і підняті RATE_LIMIT_AUTH_PER_MINUTE)`);
  return (await res.json()).accessToken;
}

// Дані: N груп по ~100 пар (5 днів × 4 пари × 5 тижнів), як реальний розклад однієї групи
async function seedGroups(admin, n) {
  const start = mondayOf();
  start.setUTCDate(start.getUTCDate() - 7);
  const lessons = [];
  for (let g = 0; g < n; g++) {
    for (let w = 0; w < 5; w++) {
      for (let d = 0; d < 5; d++) {
        for (let p = 1; p <= 4; p++) {
          const day = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
          lessons.push({ group: `НАВАНТ-${g}`, date: iso(day), pair: p, subject: `Предмет ${p}-${d}`, type: 'LECTURE', teacher: `Викладач ${(g + p + d) % 40}`, room: `${100 + p}/Б`, audience: 'GROUP', subgroup: 0 });
        }
      }
    }
  }
  const body = {
    faculties: [{ name: 'Навантажувальний факультет', short_name: 'НФ' }],
    groups: Array.from({ length: n }, (_, g) => ({ code: `НАВАНТ-${g}`, course: 1, faculty: 'НФ' })),
    lessons,
  };
  const t = performance.now();
  const res = await api('POST', '/admin/schedule/import', { token: admin, body });
  if (res.status !== 200) throw new Error(`імпорт даних дав ${res.status}: ${await res.text()}`);
  console.log(`Дані: ${n} груп, ${lessons.length} пар, імпорт за ${((performance.now() - t) / 1000).toFixed(1)} с`);
}

const stats = new Map(); // маршрут -> { ms: [], codes: Map }
function record(route, ms, status) {
  const s = stats.get(route) ?? { ms: [], codes: new Map() };
  s.ms.push(ms);
  s.codes.set(status, (s.codes.get(status) ?? 0) + 1);
  stats.set(route, s);
}
async function timed(route, method, path, opts) {
  const t = performance.now();
  let res;
  try {
    res = await api(method, path, opts);
    await res.arrayBuffer();
  } catch {
    record(route, performance.now() - t, 'network');
    return null;
  }
  record(route, performance.now() - t, res.status);
  return res;
}

async function student(i, groupIds, until) {
  const token = await login(`loadtest.${i}@lnu.edu.ua`);
  await api('PATCH', '/me', { token, body: { groupId: groupIds[i % groupIds.length] } });
  await sleep(Math.random() * 2000); // студенти відкривають застосунок не в одну мить

  // відкриття застосунку
  await timed('GET /me', 'GET', '/me', { token });
  let etag;
  const week = async () => {
    const res = await timed('GET /schedule/week', 'GET', `/schedule/week?date=${iso(mondayOf())}`, { token, headers: etag ? { 'if-none-match': etag } : {} });
    if (res?.headers.get('etag')) etag = res.headers.get('etag');
  };
  await week();

  while (performance.now() < until) {
    await sleep(jitter(THINK_MS));
    const roll = Math.random();
    if (roll < 0.6) await week();
    else if (roll < 0.85) await timed('GET /classrooms?q', 'GET', `/classrooms?q=${['1', '10', '20', 'Б'][Math.floor(Math.random() * 4)]}`, { token });
    else await timed('GET /me', 'GET', '/me', { token });
  }
}

const pct = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((arr.length * p) / 100))] : 0);

async function main() {
  console.log(`Ціль ${BASE}: ${USERS} користувачів, ${opt.duration} с, пауза ~${THINK_MS} мс`);
  const health = await fetch(`${BASE}/health/ready`).catch(() => null);
  if (!health || health.status !== 200) throw new Error('/health/ready не відповідає 200: сервер не готовий');

  const admin = await login('e2e.admin@lnu.edu.ua');
  if (GROUPS > 0) await seedGroups(admin, GROUPS);
  const all = await (await api('GET', '/groups', { token: admin })).json();
  const groupIds = all.filter((g) => (GROUPS > 0 ? g.code.startsWith('НАВАНТ-') : true)).map((g) => g.id);
  if (groupIds.length === 0) throw new Error('немає груп');

  const started = performance.now();
  const until = started + DURATION_MS;
  await Promise.all(Array.from({ length: USERS }, (_, i) => student(i, groupIds, until)));
  const seconds = (performance.now() - started) / 1000;

  let total = 0;
  let bad = 0;
  console.log('\nмаршрут                    запитів  RPS    p50    p95    p99    max   коди');
  for (const [route, s] of [...stats.entries()].sort()) {
    total += s.ms.length;
    const errors = [...s.codes.entries()].filter(([c]) => c === 'network' || (typeof c === 'number' && c >= 400));
    bad += errors.reduce((n, [, c]) => n + c, 0);
    const codes = [...s.codes.entries()].map(([c, n]) => `${c}×${n}`).join(' ');
    console.log(`${route.padEnd(26)} ${String(s.ms.length).padStart(7)} ${(s.ms.length / seconds).toFixed(0).padStart(5)} ${pct(s.ms, 50).toFixed(0).padStart(6)} ${pct(s.ms, 95).toFixed(0).padStart(6)} ${pct(s.ms, 99).toFixed(0).padStart(6)} ${Math.max(...s.ms).toFixed(0).padStart(6)}   ${codes}`);
  }
  const weekP95 = pct(stats.get('GET /schedule/week')?.ms ?? [], 95);
  console.log(`\nУсього ${total} запитів за ${seconds.toFixed(0)} с (${(total / seconds).toFixed(0)} RPS), помилок ${bad} (${((bad / total) * 100).toFixed(2)}%)`);
  if (bad / total > 0.01) { console.error('ПРОВАЛ: частка помилок понад 1%'); process.exit(1); }
  if (weekP95 > MAX_P95) { console.error(`ПРОВАЛ: p95 розкладу тижня ${weekP95.toFixed(0)} мс понад поріг ${MAX_P95} мс`); process.exit(1); }
  console.log('OK');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
