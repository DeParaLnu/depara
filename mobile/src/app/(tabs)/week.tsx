import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { addDays, fromIsoDate, mondayOf, toIsoDate } from '../../lib/date';
import { errorCode, isNetworkError } from '../../lib/errors';
import { useGroupLabel, useNow, useWeek } from '../../features/schedule/hooks';
import type { TodayState } from '../../features/schedule/TodayView';
import { WeekView } from '../../features/schedule/WeekView';

// Контейнер екрана «Тиждень» (F3): бере дані тижня з API і віддає їх у WeekView
export default function WeekRoute() {
  const now = useNow();
  const currentMonday = mondayOf(now);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  // F8: натискання на пуш про заміну відкриває її тиждень і деталі пари (див. features/push/usePush.ts)
  const { date, lessonId, openedAt } = useLocalSearchParams<{ date?: string; lessonId?: string; openedAt?: string }>();
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!date || !lessonId) return;
    setWeekStart(mondayOf(fromIsoDate(date)));
    setFocusId(lessonId);
    // openedAt змінюється з кожним натисканням, навіть коли пара та сама
  }, [openedAt]);

  const week = useWeek(toIsoDate(weekStart));
  // Чекаємо на свіжі дані: у збереженому тижні заміни, про яку пуш, ще немає
  const focusLesson = (focusId && !week.isFetching && week.data?.lessons.find((l) => l.id === focusId)) || null;
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
      focusLesson={focusLesson}
      onFocusShown={() => setFocusId(null)}
      refreshing={week.isRefetching && !week.isPending}
      onRefresh={() => {
        void week.refetch();
        void refetchMe();
      }}
    />
  );
}
