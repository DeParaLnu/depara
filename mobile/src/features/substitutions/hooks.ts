import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type NewSubstitution } from '../../api';
import { useSession } from '../auth/session';
import { useMe } from '../schedule/hooks';
import { canManageSubstitutions } from './form';

const useToken = () => useSession((s) => s.session?.accessToken);

/** Чи показувати «Додати заміну» і «Скасувати заміну» (староста своєї групи або адмін). */
export function useCanManageSubstitutions(): boolean {
  return canManageSubstitutions(useMe().data);
}

/** Пошук викладача для заміни «Інший викладач» (GET /teachers, до 20 результатів). */
export function useTeachers(q: string, enabled: boolean) {
  const token = useToken();
  const query = q.trim();
  return useQuery({
    queryKey: ['teachers', query],
    queryFn: () => api.teachers(token!, query || undefined),
    enabled: !!token && enabled,
    staleTime: 10 * 60_000,
  });
}

// Після створення чи скасування заміни перезавантажуємо всі тижні: заміна могла перенести пару в інший тиждень
const useRefreshWeeks = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['week'] });
};

export function useCreateSubstitution() {
  const token = useToken();
  const refreshWeeks = useRefreshWeeks();
  return useMutation({
    mutationKey: ['createSubstitution'],
    mutationFn: (body: NewSubstitution) => api.createSubstitution(token!, body),
    onSuccess: () => refreshWeeks(),
  });
}

export function useDeleteSubstitution() {
  const token = useToken();
  const refreshWeeks = useRefreshWeeks();
  return useMutation({
    mutationKey: ['deleteSubstitution'],
    mutationFn: (id: string) => api.deleteSubstitution(token!, id),
    onSuccess: () => refreshWeeks(),
  });
}
