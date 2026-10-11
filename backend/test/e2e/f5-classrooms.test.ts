import { describe, expect, it } from 'vitest';
import { API, authHeaders, setupStudent } from './helpers';

describe('F5: пошук аудиторій', () => {
  it('пошук 218 повертає аудиторію з літерою корпусу', async () => {
    const token = await setupStudent('f5.student@lnu.edu.ua');
    const res = await fetch(`${API}/classrooms?q=218`, { headers: authHeaders(token) });
    expect(res.status).toBe(200);
    const rooms = (await res.json()) as { label: string; building: { code: string } }[];
    const room = rooms.find((r) => r.label === '218/Т');
    expect(room).toBeTruthy();
    expect(room?.building.code).toBe('Т');
  });
});
