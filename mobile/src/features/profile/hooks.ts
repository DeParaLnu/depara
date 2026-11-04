import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useSession } from '../auth/session';

/**
 * Зберегти групу й підгрупу (PATCH /me): онбординг і профіль.
 * Розклад залежить від групи й підгрупи, тож збережені тижні (і в памʼяті, і на диску) скидаємо,
 * інакше офлайн показав би розклад попередньої групи. Активні екрани завантажать тиждень заново.
 */
export function useSetGroup() {
  const token = useSession((s) => s.session?.accessToken ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['setGroup'],
    mutationFn: ({ groupId, subgroup }: { groupId: string; subgroup: number }) => api.setGroup(token, groupId, subgroup),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.resetQueries({ queryKey: ['week'] });
    },
  });
}
