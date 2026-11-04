import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Group } from '../../api';
import { errorCode } from '../../lib/errors';
import { colors, errorText } from '../../theme';
import { useSession } from '../auth/session';
import { SUBGROUPS } from '../profile/group';
import { useSetGroup } from '../profile/hooks';
import { useGroups, useMe } from '../schedule/hooks';
import { NotificationsStep } from './NotificationsStep';

type Faculty = { name: string; groups: number };

// Факультети беремо з GET /groups: окремого ендпоінта для них немає
function toFaculties(groups: Group[]): Faculty[] {
  const counts = new Map<string, number>();
  for (const g of groups) counts.set(g.faculty, (counts.get(g.faculty) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, groups: count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

const groupsLabel = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} група`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} групи`;
  return `${n} груп`;
};

type Props =
  | { mode?: 'onboarding' }
  /** F9: зміна групи з профілю. Починає з поточної групи; «Назад» зі списку факультетів закриває екран */
  | { mode: 'change'; onDone: () => void; onCancel: () => void };

// F2: факультет → група і підгрупа. Крок «спеціальність», код старости і дозвіл на сповіщення
// додамо, коли для них зʼявиться підтримка в API. Той самий екран змінює групу з профілю (F9, mode="change").
export function OnboardingScreen(props: Props) {
  const changing = props.mode === 'change';
  const insets = useSafeAreaInsets();
  const finishOnboarding = useSession((s) => s.finishOnboarding);
  const groups = useGroups();
  const me = useMe();
  // Поточна група: при зміні з профілю з неї починається вибір
  const current = changing ? groups.data?.find((g) => g.id === me.data?.groupId) : undefined;

  // undefined = ще не обирали, тоді діє поточне значення профілю (при онбордингу його немає)
  const [chosenFaculty, setFaculty] = useState<string | null | undefined>(undefined);
  const [chosenGroupId, setGroupId] = useState<string | null | undefined>(undefined);
  const [chosenSubgroup, setSubgroup] = useState<number | undefined>(undefined);
  const [chosenCourse, setCourse] = useState<number | null | undefined>(undefined);
  const faculty = chosenFaculty === undefined ? (current?.faculty ?? null) : chosenFaculty;
  const groupId = chosenGroupId === undefined ? (current?.id ?? null) : chosenGroupId;
  const subgroup = chosenSubgroup ?? (changing ? (me.data?.subgroup ?? 0) : 0);
  const course = chosenCourse === undefined ? (current?.faculty === faculty ? (current?.course ?? null) : null) : chosenCourse;

  const faculties = useMemo(() => toFaculties(groups.data ?? []), [groups.data]);
  const facultyGroups = useMemo(
    () =>
      (groups.data ?? [])
        .filter((g) => g.faculty === faculty)
        .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code, 'uk')),
    [groups.data, faculty],
  );
  const courses = useMemo(() => [...new Set(facultyGroups.map((g) => g.course))], [facultyGroups]);
  const activeCourse = course ?? courses[0] ?? null;
  const courseGroups = useMemo(
    () => facultyGroups.filter((g) => g.course === activeCourse),
    [facultyGroups, activeCourse],
  );

  // Онбординг: після групи останній крок «Не пропустіть заміну» (макет 07). Група вже є, а онбординг не завершено
  // (застосунок закрили на цьому кроці): одразу показуємо його, а не вибір групи
  const [notificationsStep, setNotificationsStep] = useState(false);
  const showNotifications = !changing && (notificationsStep || !!me.data?.groupId);

  const setGroup = useSetGroup();
  const save = {
    ...setGroup,
    mutate: () =>
      setGroup.mutate(
        { groupId: groupId!, subgroup },
        { onSuccess: () => (props.mode === 'change' ? props.onDone() : setNotificationsStep(true)) },
      ),
  };
  const unchanged = changing && groupId === me.data?.groupId && subgroup === me.data?.subgroup;
  const saveDisabled = !groupId || save.isPending || unchanged;

  const error = groups.isError ? groups.error : save.isError ? save.error : null;
  const errorMessageCode = error ? errorCode(error) : null;

  const goBack = () => {
    setFaculty(null);
    setGroupId(null);
    setCourse(null);
    save.reset();
  };
  const onCancel = props.mode === 'change' ? props.onCancel : null;

  if (showNotifications) return <NotificationsStep onDone={finishOnboarding} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.topBar}>
        {faculty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад до вибору факультету"
            onPress={goBack}
            hitSlop={12}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={28} color={colors.primary} />
          </Pressable>
        ) : onCancel ? (
          <Pressable
            testID="change-group-cancel"
            accessibilityRole="button"
            accessibilityLabel="Назад до профілю"
            onPress={onCancel}
            hitSlop={12}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={28} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.title} accessibilityRole="header">
          {faculty ? (changing ? 'Змінити групу' : 'Оберіть групу') : changing ? 'Факультет' : 'Ваш факультет'}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {faculty ? faculty : changing ? 'Оберіть факультет нової групи' : 'Далі оберете свою групу, щоб бачити розклад'}
      </Text>

      {errorMessageCode && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{errorText(errorMessageCode)}</Text>
          {groups.isError && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Спробувати ще раз"
              onPress={() => void groups.refetch()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Спробувати ще раз</Text>
            </Pressable>
          )}
        </View>
      )}

      {groups.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !faculty ? (
        <FlatList
          testID="faculty-list"
          data={faculties}
          keyExtractor={(f) => f.name}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => {
                // Новий факультет: група й курс обираються заново (поточна група лишилась би непоміченою)
                setFaculty(item.name);
                setGroupId(null);
                setCourse(null);
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionSelected]}
            >
              <View style={styles.radio} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{item.name}</Text>
                <Text style={styles.optionMeta}>{groupsLabel(item.groups)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={groups.isError ? undefined : <Text style={styles.subtitle}>Факультетів поки немає</Text>}
        />
      ) : (
        <>
          {courses.length > 1 && (
            <View style={styles.block}>
              <Text style={styles.sectionLabel}>Курс</Text>
              <View style={styles.segments} accessibilityRole="radiogroup">
                {courses.map((c) => {
                  const selected = c === activeCourse;
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                      aria-checked={selected}
                      accessibilityLabel={`${c} курс`}
                      onPress={() => {
                        setCourse(c);
                        setGroupId(null);
                      }}
                      style={[styles.segment, selected && styles.segmentSelected]}
                    >
                      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Text style={[styles.sectionLabel, styles.block]}>Група</Text>
          <FlatList
            testID="group-list"
            data={courseGroups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = item.id === groupId;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={`${item.code}, ${item.course} курс`}
                  onPress={() => setGroupId(item.id)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{item.code}</Text>
                </Pressable>
              );
            }}
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sectionLabel}>Підгрупа</Text>
            <View style={styles.segments} accessibilityRole="radiogroup">
              {SUBGROUPS.map((s) => {
                const selected = s.value === subgroup;
                return (
                  <Pressable
                    key={s.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    aria-checked={selected}
                    accessibilityLabel={s.a11y}
                    onPress={() => setSubgroup(s.value)}
                    style={[styles.segment, selected && styles.segmentSelected]}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID={changing ? 'change-group-save' : 'onboarding-continue'}
              accessibilityRole="button"
              accessibilityLabel={changing ? 'Зберегти' : 'Продовжити'}
              accessibilityState={{ disabled: saveDisabled }}
              disabled={saveDisabled}
              onPress={() => save.mutate()}
              style={({ pressed }) => [
                styles.primary,
                saveDisabled && styles.primaryDisabled,
                pressed && styles.primaryPressed,
              ]}
            >
              {save.isPending ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryText}>{changing ? 'Зберегти' : 'Продовжити'}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  back: { width: 32, height: 32, justifyContent: 'center' },
  title: { flex: 1, fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 20, textAlign: 'right' },
  block: { marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textTime, textTransform: 'uppercase', letterSpacing: 0.3 },
  list: { paddingBottom: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: { backgroundColor: '#EEF5FF', borderBottomColor: 'transparent', borderRadius: 14 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { flex: 1, fontSize: 17, lineHeight: 22, color: '#374151' },
  optionTitleSelected: { fontWeight: '700', color: colors.primary },
  optionMeta: { fontSize: 13, color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: { gap: 12, alignItems: 'center', marginBottom: 12 },
  error: { fontSize: 15, color: colors.error, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.surface, fontWeight: '600' },
  footer: { gap: 12, paddingTop: 12 },
  segments: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: colors.chip, marginTop: 8 },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  segmentTextSelected: { color: colors.primary, fontWeight: '700' },
  primary: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { color: colors.surface, fontWeight: '700', fontSize: 16 },
});
