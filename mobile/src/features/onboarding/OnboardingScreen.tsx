import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Group } from '../../api';
import { errorCode } from '../../lib/errors';
import { colors, errorText } from '../../theme';
import { useSession } from '../auth/session';
import { useGroups } from '../schedule/hooks';

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

const SUBGROUPS = [
  { value: 0, label: 'Усі' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
] as const;

// F2: факультет → група і підгрупа. Крок «спеціальність», код старости і дозвіл на сповіщення
// додамо, коли для них зʼявиться підтримка в API.
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const token = useSession((s) => s.session?.accessToken ?? '');
  const finishOnboarding = useSession((s) => s.finishOnboarding);
  const queryClient = useQueryClient();
  const groups = useGroups();

  const [faculty, setFaculty] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [subgroup, setSubgroup] = useState<number>(0);
  const [course, setCourse] = useState<number | null>(null);

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

  const save = useMutation({
    mutationKey: ['setGroup'],
    mutationFn: () => api.setGroup(token, groupId!, subgroup),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      finishOnboarding();
    },
  });

  const error = groups.isError ? groups.error : save.isError ? save.error : null;
  const errorMessageCode = error ? errorCode(error) : null;

  const goBack = () => {
    setFaculty(null);
    setGroupId(null);
    setCourse(null);
    save.reset();
  };

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
        ) : (
          <View style={styles.back} />
        )}
        <Text style={styles.title} accessibilityRole="header">
          {faculty ? 'Оберіть групу' : 'Ваш факультет'}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {faculty ? faculty : 'Далі оберете свою групу, щоб бачити розклад'}
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
              onPress={() => setFaculty(item.name)}
              style={({ pressed }) => [styles.option, pressed && styles.optionSelected]}
            >
              <View style={styles.radio} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{item.name}</Text>
                <Text style={styles.optionMeta}>{groupsLabel(item.groups)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={groups.isError ? null : <Text style={styles.subtitle}>Факультетів поки немає</Text>}
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
                      accessibilityState={{ selected }}
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
                  accessibilityState={{ selected }}
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
                    accessibilityState={{ selected }}
                    accessibilityLabel={s.value === 0 ? 'Усі підгрупи' : `Підгрупа ${s.label}`}
                    onPress={() => setSubgroup(s.value)}
                    style={[styles.segment, selected && styles.segmentSelected]}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              testID="onboarding-continue"
              accessibilityRole="button"
              accessibilityLabel="Продовжити"
              accessibilityState={{ disabled: !groupId || save.isPending }}
              disabled={!groupId || save.isPending}
              onPress={() => save.mutate()}
              style={({ pressed }) => [
                styles.primary,
                (!groupId || save.isPending) && styles.primaryDisabled,
                pressed && styles.primaryPressed,
              ]}
            >
              {save.isPending ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryText}>Продовжити</Text>
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
    borderRadius: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: { backgroundColor: '#EEF5FF', borderBottomColor: 'transparent' },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { flex: 1, fontSize: 17, lineHeight: 22, color: '#374151' },
  optionTitleSelected: { fontWeight: '700', color: colors.primary },
  optionMeta: { fontSize: 13, color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
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
