#!/usr/bin/env node
// Замір імпорту розкладу: скільки часу займає POST /admin/schedule/import на обсязі факультету.
// Без залежностей, лише Node 22.
//
// ПОТРІБЕН сервер у тестовому режимі (фейковий вхід): NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=e2e.admin@lnu.edu.ua
// і піднятий ліміт імпорту: RATE_LIMIT_IMPORT_PER_MINUTE=1000. Запускайте лише проти тестової бази (в імені є `test`):
// скрипт створює факультет БЕНЧ, його групи, викладачів і пари. Проти проду він не спрацює: фейковий вхід там відхиляється.
//
//   node scripts/import-bench.mjs [--base http://localhost:3000] [--groups 40] [--weeks 16] [--pairs 4] [--drop 0.1]
//
// --groups  скільки груп факультету
// --weeks   скільки тижнів розкладу на групу (семестр ≈ 16)
// --pairs   скільки пар на день (5 днів на тиждень)
// --drop    частка пар, яких немає в третьому файлі (імітація «деканат прибрав пари»)
//
// Три проходи: 1) усе нове, 2) той самий файл (усе оновлення), 3) файл без частини пар. Третій прохід показує,
// що пари, яких немає у файлі, у базі лишаються (імпорт лише додає й оновлює), це лічильник `imported` проти
// кількості пар у файлі; кількість рядків у базі перевіряйте SQL-запитом за групами БЕНЧ-*.
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3000' },
    groups: { type: 'string', default: '40' },
    weeks: { type: 'string', default: '16' },
    pairs: { type: 'string', default: '4' },
    drop: { type: 'string', default: '0.1' },
  },
});
const BASE = opt.base.replace(/\/$/, '');
const GROUPS = Number(opt.groups);
const WEEKS = Number(opt.weeks);
const PAIRS = Number(opt.pairs);
const DROP = Number(opt.drop);
const TIMEOUT_S = 120; // таймаут транзакції в scheduleImport.ts
const iso = (d) => d.toISOString().slice(0, 10);

async function api(method, path, { token, body } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function adminToken() {
  const res = await api('POST', '/auth/microsoft', { body: { idToken: 'test:e2e.admin@lnu.edu.ua', deviceId: 'import-bench' } });
  if (res.status !== 200) throw new Error(`вхід адміна дав ${res.status}: ${await res.text()} (потрібен AUTH_MODE=fake і ADMIN_EMAILS=e2e.admin@lnu.edu.ua)`);
  return (await res.json()).accessToken;
}

function buildPayload() {
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const lessons = [];
  for (let g = 0; g < GROUPS; g++) {
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 5; d++) {
        for (let p = 1; p <= PAIRS; p++) {
          const day = new Date(monday.getTime() + (w * 7 + d) * 86_400_000);
          lessons.push({
            group: `БЕНЧ-${g}`, date: iso(day), pair: p, subject: `Предмет ${(g + p + d) % 30}`, type: 'LECTURE',
            teacher: `Бенч Викладач ${(g * 3 + p + d) % 120}`, room: `${100 + ((g + p) % 40)}/Б`, audience: 'GROUP', subgroup: 0,
          });
        }
      }
    }
  }
  return {
    pair_times: Array.from({ length: PAIRS }, (_, i) => ({ pair: i + 1, start: `${8 + i * 2}:00`.padStart(5, '0'), end: `${9 + i * 2}:20`.padStart(5, '0') })),
    faculties: [{ name: 'Бенч-факультет', short_name: 'БЕНЧ' }],
    groups: Array.from({ length: GROUPS }, (_, g) => ({ code: `БЕНЧ-${g}`, course: 1, faculty: 'БЕНЧ' })),
    buildings: [{ code: 'Б', name: 'Корпус Б', address: 'вул. Драгоманова, 50' }],
    lessons,
  };
}

async function run(label, token, body) {
  const bytes = Buffer.byteLength(JSON.stringify(body));
  const t = performance.now();
  const res = await api('POST', '/admin/schedule/import', { token, body });
  const s = (performance.now() - t) / 1000;
  const text = await res.text();
  const n = body.lessons.length;
  console.log(`${label}: HTTP ${res.status}, ${n} пар, ${(bytes / 1e6).toFixed(2)} МБ, ${s.toFixed(1)} с (${(n / s).toFixed(0)} пар/с), ${s > TIMEOUT_S * 0.6 ? '⚠ понад 60% таймауту ' + TIMEOUT_S + ' с' : 'у межах таймауту'}`);
  console.log(`   відповідь: ${text.slice(0, 200)}`);
  return res.status === 200;
}

const payload = buildPayload();
console.log(`Ціль ${BASE}: ${GROUPS} груп × ${WEEKS} тижнів × 5 днів × ${PAIRS} пар = ${payload.lessons.length} пар (ліміт імпорту 20000)`);
const token = await adminToken();
let ok = await run('1) нові пари   ', token, payload);
if (ok) ok = await run('2) той самий файл', token, payload);
if (ok) {
  const kept = payload.lessons.filter((_, i) => i % Math.round(1 / (DROP || 1)) !== 0 || DROP === 0);
  await run(`3) без ${(DROP * 100).toFixed(0)}% пар`, token, { ...payload, lessons: kept });
}
process.exit(ok ? 0 : 1);
