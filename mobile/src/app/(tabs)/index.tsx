import { useState } from 'react';
import { ApiError } from '../../api';
import { mondayOf, toIsoDate } from '../../lib/date';
import { useGroups, useMe, useNow, useWeek } from '../../features/schedule/hooks';
import { TodayView, type TodayState } from '../../features/schedule/TodayView';

// Контейнер екрана «Сьогодні»: бере дані з API і віддає їх у TodayView
export default function TodayRoute() {
  const now = useNow();
  const [selected, setSelected] = useState(() => new Date());

  const week = useWeek(toIsoDate(mondayOf(now)));
  const me = useMe();
  const groups = useGroups();

  let state: TodayState;
  if (week.data) {
    state = {
      kind: 'ready',
      lessons: week.data.lessons,
      // Дані є, але останнє оновлення не вдалось через мережу: показуємо збережене з позначкою «Офлайн»
      offline: week.isError && week.error instanceof ApiError && week.error.code === 'NETWORK_ERROR',
      updatedAt: week.dataUpdatedAt ? new Date(week.dataUpdatedAt) : null,
    };
  } else if (week.isError) {
    state = { kind: 'error', code: week.error instanceof ApiError ? week.error.code : 'UNKNOWN' };
  } else {
    state = { kind: 'loading' };
  }

  const group = groups.data?.find((g) => g.id === me.data?.groupId);
  const subgroup = me.data ? (me.data.subgroup === 0 ? 'усі підгрупи' : `підгрупа ${me.data.subgroup}`) : '';
  const subtitle = [group?.code, subgroup].filter(Boolean).join(' · ');

  return (
    <TodayView
      now={now}
      selected={selected}
      onSelect={setSelected}
      subtitle={subtitle}
      isHeadman={me.data?.role === 'HEADMAN'}
      state={state}
      refreshing={week.isRefetching && !week.isPending}
      onRefresh={() => {
        void week.refetch();
        void me.refetch();
      }}
    />
  );
}
