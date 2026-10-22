import { describe, expect, it } from 'vitest';
import { API, authHeaders, setupStudent } from './helpers';

type Room = { id: string; number: string; label: string; building: { code: string; name: string; address: string } };

async function searchRooms(token: string, q?: string, building?: string): Promise<{ status: number; rooms: Room[] }> {
  const params = new URLSearchParams();
  if (q !== undefined) params.set('q', q);
  if (building !== undefined) params.set('building', building);
  const url = `${API}/classrooms${params.size ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  return { status: res.status, rooms: res.status === 200 ? ((await res.json()) as Room[]) : [] };
}

// Критерії приймання зі specs/f5-search.md. У seed є N10/Б і N11/Б (латинська N), а також №9/Б і №5/Б.
describe('F5: пошук аудиторій', () => {
  it('пошук 218 повертає аудиторію з літерою корпусу', async () => {
    const token = await setupStudent('f5.student@lnu.edu.ua');
    const { status, rooms } = await searchRooms(token, '218');
    expect(status).toBe(200);
    const room = rooms.find((r) => r.label === '218/Т');
    expect(room).toBeTruthy();
    expect(room?.building.code).toBe('Т');
  });

  it('запит N1 повертає лише аудиторії, номер яких містить N1, не більше 20', async () => {
    const token = await setupStudent('f5.n1@lnu.edu.ua');
    const { status, rooms } = await searchRooms(token, 'N1');
    expect(status).toBe(200);
    expect(rooms.length).toBeLessThanOrEqual(20);
    expect(rooms.map((r) => r.label).sort()).toEqual(['N10/Б', 'N11/Б']);
    expect(rooms.every((r) => r.number.toLowerCase().includes('n1'))).toBe(true);
  });

  it('регістр запиту не впливає на результат', async () => {
    const token = await setupStudent('f5.case@lnu.edu.ua');
    const upper = await searchRooms(token, 'N1');
    const lower = await searchRooms(token, 'n1');
    expect(lower.status).toBe(200);
    expect(lower.rooms.map((r) => r.id).sort()).toEqual(upper.rooms.map((r) => r.id).sort());
  });

  it('порожній запит повертає список без помилки, не більше 20', async () => {
    const token = await setupStudent('f5.empty@lnu.edu.ua');
    for (const q of [undefined, '']) {
      const { status, rooms } = await searchRooms(token, q);
      expect(status).toBe(200);
      expect(rooms.length).toBeGreaterThan(0);
      expect(rooms.length).toBeLessThanOrEqual(20);
    }
  });

  it('для кожної аудиторії видно корпус', async () => {
    const token = await setupStudent('f5.building@lnu.edu.ua');
    const { rooms } = await searchRooms(token, '');
    for (const r of rooms) {
      expect(r.building.code, r.label).toBeTruthy();
      expect(r.building.name, r.label).toBeTruthy();
      expect(r.building.address, r.label).toBeTruthy();
      expect(r.label.endsWith(`/${r.building.code}`)).toBe(true);
    }
  });

  it('фільтр building лишає аудиторії лише цього корпусу, регістр не важливий', async () => {
    const token = await setupStudent('f5.filter@lnu.edu.ua');
    const t = await searchRooms(token, undefined, 'Т');
    expect(t.status).toBe(200);
    expect(t.rooms.length).toBeGreaterThan(0);
    expect(t.rooms.every((r) => r.building.code === 'Т')).toBe(true);
    expect(t.rooms.map((r) => r.label)).toContain('218/Т');
    expect(t.rooms.map((r) => r.label)).not.toContain('N10/Б');

    const b = await searchRooms(token, undefined, 'Б');
    expect(b.rooms.every((r) => r.building.code === 'Б')).toBe(true);
    expect(b.rooms.map((r) => r.label)).toContain('N10/Б');
  });

  it('building і q працюють разом, невідомий корпус дає порожній список', async () => {
    const token = await setupStudent('f5.combo@lnu.edu.ua');
    const both = await searchRooms(token, 'N1', 'Б');
    expect(both.rooms.map((r) => r.label).sort()).toEqual(['N10/Б', 'N11/Б']);
    expect((await searchRooms(token, 'N1', 'Т')).rooms).toEqual([]);

    const unknown = await searchRooms(token, undefined, 'Я');
    expect(unknown.status).toBe(200);
    expect(unknown.rooms).toEqual([]);
    // порожнє значення фільтра ігнорується
    expect((await searchRooms(token, undefined, '')).rooms.length).toBeGreaterThan(0);
  });

  it('без токена повертає 401', async () => {
    const res = await fetch(`${API}/classrooms?q=N1`);
    expect(res.status).toBe(401);
  });
});
