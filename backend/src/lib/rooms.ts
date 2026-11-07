// Єдиний формат аудиторії: номер («218», «129а», «N10») і код корпусу (велика кирилична літера з довідника).

// Латинські літери, схожі на кириличні: «T» з англійської розкладки це корпус «Т»
const LATIN_TO_CYRILLIC: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
};

const stripSpaces = (s: string) => s.replace(/\s+/g, '');

// №, n і кирилична Н на початку це той самий префікс N. Лише перед цифрою або самі по собі (запит ще набирають):
// інакше зіпсувалися б словесні назви на кшталт «Навчальна»
export const normalizeRoomNumber = (s: string) => stripSpaces(s).replace(/^[№NnНн](?=\d|$)/, 'N');

export const normalizeBuildingCode = (s: string) =>
  [...stripSpaces(s).toUpperCase()].map((ch) => LATIN_TO_CYRILLIC[ch] ?? ch).join('');

// "№ 9 / б" -> { number: "N9", code: "Б" }. Ділимо по ОСТАННЬОМУ слешу. Без слеша корпус порожній (запит «218»).
export function normalizeRoom(raw: string): { number: string; code: string } {
  const i = raw.lastIndexOf('/');
  if (i < 0) return { number: normalizeRoomNumber(raw), code: '' };
  return { number: normalizeRoomNumber(raw.slice(0, i)), code: normalizeBuildingCode(raw.slice(i + 1)) };
}

type ClassroomWithBuilding = { id: string; number: string; building: { code: string; name: string; address: string } };

// Аудиторія у відповідях API: той самий вигляд у пошуку, розкладі й замінах
export const toRoom = (c: ClassroomWithBuilding) => ({
  id: c.id,
  number: c.number,
  label: `${c.number}/${c.building.code}`,
  building: { code: c.building.code, name: c.building.name, address: c.building.address },
});
