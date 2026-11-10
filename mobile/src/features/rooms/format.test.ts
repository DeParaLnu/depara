import { describe, expect, it } from 'vitest';
import { roomTitle } from './format';

describe('roomTitle', () => {
  const building = { code: 'Т', name: 'Корпус на Тарнавського', address: 'вул. Генерала Тарнавського, 107' };

  it('один вигляд для всіх екранів: корпус, потім аудиторія', () => {
    expect(roomTitle({ number: '218', building })).toBe('Корпус Т · ауд. 218');
    expect(roomTitle({ number: 'N10', building: { ...building, code: 'Б' } })).toBe('Корпус Б · ауд. N10');
  });
});
