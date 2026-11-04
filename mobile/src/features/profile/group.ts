import type { Me } from '../../api';

// F9: хто може сам змінити групу. Староста з групою не може: його права на заміни прив'язані до групи,
// і бекенд відповідає 403 HEADMAN_GROUP_LOCKED. Групу старості змінює адмін. Підгрупу можуть змінювати всі.
export const canChangeOwnGroup = (me: Pick<Me, 'role' | 'groupId'> | undefined): boolean =>
  !!me && !(me.role === 'HEADMAN' && !!me.groupId);

export const SUBGROUPS = [
  { value: 0, label: 'Усі', a11y: 'Усі підгрупи' },
  { value: 1, label: '1', a11y: 'Підгрупа 1' },
  { value: 2, label: '2', a11y: 'Підгрупа 2' },
] as const;

export const subgroupLabel = (subgroup: number) => (subgroup === 0 ? 'Усі' : String(subgroup));
