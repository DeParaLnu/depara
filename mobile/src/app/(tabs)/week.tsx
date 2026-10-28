import { useState } from 'react';
import { addDays, mondayOf, toIsoDate } from '../../lib/date';
import { errorCode, isNetworkError } from '../../lib/errors';
import { useGroupLabel, useNow, useWeek } from '../../features/schedule/hooks';
import type { TodayState } from '../../features/schedule/TodayView';
import { WeekView } from '../../features/schedule/WeekView';

// Контейнер екрана «Тиждень» (F3): бере дані тижня з API і віддає їх у WeekView
export default function WeekRoute() {
  const now = useNow();
  const currentMonday = mondayOf(now);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  const week = useWeek(toIsoDate(weekStart));
  const { subtitle, isHeadman, refetchMe } = useGroupLabel();

  let state: TodayState;
  if (week.data) {
    state = {
      kind: 'ready',
      lessons: week.data.lessons,
      published: week.data.published,
      // Дані є, але останнє оновлення не вдалось через мережу: показуємо збережене з позначкою «Офлайн»
      offline: week.isError && isNetworkError(week.error),
      updatedAt: week.dataUpdatedAt ? new Date(week.dataUpdatedAt) : null,
    };
  } else if (week.isError) {
    state = { kind: 'error', code: errorCode(week.error) };
  } else {
    state = { kind: 'loading' };
  }

  return (
    <WeekView
      now={now}
      weekStart={weekStart}
      isCurrentWeek={toIsoDate(weekStart) === toIsoDate(currentMonday)}
      onPrev={() => setWeekStart((d) => addDays(d, -7))}
      onNext={() => setWeekStart((d) => addDays(d, 7))}
      onCurrent={() => setWeekStart(mondayOf(new Date()))}
      subtitle={subtitle}
      isHeadman={isHeadman}
      state={state}
      refreshing={week.isRefetching && !week.isPending}
      onRefresh={() => {
        void week.refetch();
        void refetchMe();
      }}
    />
  );
}
