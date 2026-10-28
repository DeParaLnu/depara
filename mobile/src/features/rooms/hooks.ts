import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSession } from '../auth/session';

const useToken = () => useSession((s) => s.session?.accessToken);

export function useDebounce<T>(value: T, delayMs = 150): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function useClassrooms(q?: string, building?: string) {
  const token = useToken();
  const trimmedQ = q?.trim() || undefined;
  const trimmedBuilding = building?.trim() || undefined;

  return useQuery({
    queryKey: ['classrooms', trimmedQ ?? '', trimmedBuilding ?? ''],
    queryFn: () => {
      if (!token) throw new Error('UNAUTHORIZED');
      return api.classrooms(token, trimmedQ, trimmedBuilding);
    },
    enabled: !!token,
    staleTime: 60_000,
  });
}
