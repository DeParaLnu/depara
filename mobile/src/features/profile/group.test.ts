import { describe, expect, it } from 'vitest';
import { canChangeOwnGroup, subgroupLabel } from './group';

describe('canChangeOwnGroup', () => {
  it('студент і адмін змінюють групу самі, староста з групою ні', () => {
    expect(canChangeOwnGroup({ role: 'STUDENT', groupId: 'g' })).toBe(true);
    expect(canChangeOwnGroup({ role: 'ADMIN', groupId: 'g' })).toBe(true);
    expect(canChangeOwnGroup({ role: 'HEADMAN', groupId: 'g' })).toBe(false);
  });

  it('староста без групи (онбординг) обирає її сам', () => {
    expect(canChangeOwnGroup({ role: 'HEADMAN', groupId: null })).toBe(true);
  });

  it('без профілю нічого не дозволяємо', () => {
    expect(canChangeOwnGroup(undefined)).toBe(false);
  });
});

describe('subgroupLabel', () => {
  it('0 = усі підгрупи', () => {
    expect(subgroupLabel(0)).toBe('Усі');
    expect(subgroupLabel(2)).toBe('2');
  });
});
