import type { Building } from '../../api';

// Латинські літери, схожі на кириличні літери корпусів: «T» з англійської розкладки має знайти корпус «Т»
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х',
};

const normalize = (s: string) => s.trim().toLowerCase().replace(/[’ʼ`]/g, "'");

const normalizeCode = (s: string) =>
  [...normalize(s)].map((ch) => LATIN_TO_CYRILLIC[ch] ?? ch).join('');

/**
 * Чи підходить корпус під запит пошуку (F5). Одна літера порівнюється лише з літерою корпусу:
 * інакше «т» знаходила б кожен корпус, у назві чи адресі якого є «т». Довший запит шукається
 * як частина літери, назви або адреси, без урахування регістру.
 */
export function matchesBuilding(building: Building, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalizeCode(q) === normalizeCode(building.code)) return true;
  if (q.length === 1) return false;
  return normalize(building.name).includes(q) || normalize(building.address).includes(q);
}

/** Корпуси для блоку «Корпуси»: з урахуванням обраного чіпа і запиту пошуку. */
export function findBuildings(buildings: Building[], query: string, selectedCode?: string): Building[] {
  const selected = selectedCode ? normalizeCode(selectedCode) : undefined;
  return buildings.filter(
    (b) => (!selected || normalizeCode(b.code) === selected) && matchesBuilding(b, query),
  );
}
