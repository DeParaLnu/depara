import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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

export function useMe() {
  const token = useToken();
  return useQuery({ queryKey: ['me'], queryFn: () => api.me(token!), enabled: !!token });
}

export function useGroups() {
  const token = useToken();
  return useQuery({ queryKey: ['groups'], queryFn: () => api.groups(token!), enabled: !!token, staleTime: 10 * 60_000 });
}

/** Розклад тижня, до якого належить `date` (YYYY-MM-DD). */
export function useWeek(date: string) {
  const token = useToken();
  return useQuery({ queryKey: ['week', date], queryFn: () => api.week(token!, date), enabled: !!token });
}

/** Підпис «ТЕСТ-31 · підгрупа 1» і ознака старости для заголовків екранів розкладу. */
export function useGroupLabel() {
  const me = useMe();
  const groups = useGroups();
  const group = groups.data?.find((g) => g.id === me.data?.groupId);
  const subgroup = me.data ? (me.data.subgroup === 0 ? 'усі підгрупи' : `підгрупа ${me.data.subgroup}`) : '';
  return {
    subtitle: [group?.code, subgroup].filter(Boolean).join(' · '),
    isHeadman: me.data?.role === 'HEADMAN',
    refetchMe: me.refetch,
  };
}
