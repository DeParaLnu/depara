import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useSession } from '../auth/session';

/** Поточний час, що оновлюється раз на хвилину (для «ЗАРАЗ» і «залишилось N хв»). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const useToken = () => useSession((s) => s.session?.accessToken);

/** Профіль. Лише для користувача з входом: у гостя профілю немає, запит вимкнений. */
export function useMe() {
  const token = useToken();
  return useQuery({ queryKey: ['me'], queryFn: () => api.me(token!), enabled: !!token });
}

/** Список груп: із токеном іде закритий ендпоінт, без токена (гість) публічний. Дані однакові. */
export function useGroups() {
  const token = useToken();
  const isGuest = useSession((s) => !s.session && !!s.guest);
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => (token ? api.groups(token) : api.publicGroups()),
    enabled: !!token || isGuest,
    staleTime: 10 * 60_000,
  });
}

/** Звідки брати розклад: з профілю користувача (токен), з вибору гостя або нізвідки (ще не обрано). */
type ScheduleSource =
  | { kind: 'user'; token: string }
  | { kind: 'guest'; groupId: string; subgroup: number }
  | null;

function useScheduleSource(): ScheduleSource {
  // Вибираємо примітиви, а не об'єкт: інакше кожен рендер дає нове значення і хук перемальовується вічно
  const token = useSession((s) => s.session?.accessToken);
  const guestGroupId = useSession((s) => (s.session ? null : (s.guest?.groupId ?? null)));
  const guestSubgroup = useSession((s) => s.guest?.subgroup ?? 0);
  return useMemo(() => {
    if (token) return { kind: 'user', token };
    if (guestGroupId) return { kind: 'guest', groupId: guestGroupId, subgroup: guestSubgroup };
    return null;
  }, [token, guestGroupId, guestSubgroup]);
}

/**
 * Розклад тижня, до якого належить `date` (YYYY-MM-DD). Екрани не знають, хто питає:
 * користувач (група з профілю) чи гість (група з локального вибору).
 */
export function useWeek(date: string) {
  const source = useScheduleSource();
  return useQuery({
    // У ключі є джерело: після входу чи зміни групи гостем кеш іншої групи не показується
    queryKey: ['week', source?.kind === 'guest' ? `guest:${source.groupId}:${source.subgroup}` : 'me', date],
    queryFn: () =>
      source?.kind === 'guest'
        ? api.publicWeek(source.groupId, source.subgroup, date)
        : api.week(source?.kind === 'user' ? source.token : '', date),
    enabled: !!source,
  });
}

/** Підпис «ТЕСТ-31 · підгрупа 1» і ознака старости для заголовків екранів розкладу. */
export function useGroupLabel() {
  const token = useToken();
  const me = useMe();
  const groups = useGroups();
  const guest = useSession((s) => (s.session ? null : s.guest));
  const groupId = guest ? guest.groupId : me.data?.groupId;
  const subgroupNo = guest ? guest.subgroup : me.data?.subgroup;
  const group = groups.data?.find((g) => g.id === groupId);
  const subgroup =
    subgroupNo === undefined ? '' : subgroupNo === 0 ? 'усі підгрупи' : `підгрупа ${subgroupNo}`;
  return {
    subtitle: [group?.code, subgroup].filter(Boolean).join(' · '),
    isHeadman: me.data?.role === 'HEADMAN',
    // У гостя профілю немає: оновлювати нічого (refetch вимкненого запиту все одно пішов би в мережу)
    refetchMe: () => (token ? me.refetch() : Promise.resolve()),
  };
}
