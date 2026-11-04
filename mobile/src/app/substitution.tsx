import { router, useLocalSearchParams } from 'expo-router';
import { SubstitutionScreen } from '../features/substitutions/SubstitutionScreen';
import { toIsoDate } from '../lib/date';

// F6: «Нова заміна». Параметри: date (день, з якого відкрили), lessonId (пара з деталей пари)
export default function SubstitutionRoute() {
  const params = useLocalSearchParams<{ date?: string; lessonId?: string }>();
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : toIsoDate(new Date());
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return <SubstitutionScreen date={date} lessonId={params.lessonId} onClose={close} />;
}
