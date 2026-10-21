import { describe, expect, it } from 'vitest';
import { API, authHeaders, setupStudent } from './helpers';

type Room = { id: string; number: string; label: string; building: { code: string; name: string } };

async function searchRooms(token: string, q?: string): Promise<{ status: number; rooms: Room[] }> {
  const url = q === undefined ? `${API}/classrooms` : `${API}/classrooms?q=${encodeURIComponent(q)}`;
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
      expect(r.label.endsWith(`/${r.building.code}`)).toBe(true);
    }
  });

  it('без токена повертає 401', async () => {
    const res = await fetch(`${API}/classrooms?q=N1`);
    expect(res.status).toBe(401);
  });
});
