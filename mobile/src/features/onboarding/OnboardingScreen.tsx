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

  const faculties = useMemo(() => toFaculties(groups.data ?? []), [groups.data]);
  const facultyGroups = useMemo(
    () =>
      (groups.data ?? [])
        .filter((g) => g.faculty === faculty)
        .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code, 'uk')),
    [groups.data, faculty],
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
    save.reset();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      {faculty && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад до вибору факультету"
          onPress={goBack}
          hitSlop={12}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ Факультети</Text>
        </Pressable>
      )}
      <Text style={styles.title} accessibilityRole="header">
        {faculty ? 'Оберіть групу' : 'Оберіть факультет'}
      </Text>
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
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{groupsLabel(item.groups)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={groups.isError ? null : <Text style={styles.subtitle}>Факультетів поки немає</Text>}
        />
      ) : (
        <>
          <FlatList
            testID="group-list"
            data={facultyGroups}
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
                  style={[styles.card, selected && styles.cardSelected]}
                >
                  <Text style={styles.cardTitle}>{item.code}</Text>
                  <Text style={styles.cardMeta}>{item.course} курс</Text>
                </Pressable>
              );
            }}
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.footerLabel}>Підгрупа</Text>
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
  back: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  backText: { fontSize: 16, color: colors.accent, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 20 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  cardPressed: { borderColor: colors.primary },
  cardSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceSoft },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBox: { gap: 12, alignItems: 'center', marginBottom: 12 },
  error: { fontSize: 15, color: colors.error, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.surface, fontWeight: '600' },
  footer: { gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  footerLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  segments: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.text },
  segmentTextSelected: { color: colors.surface },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { color: colors.surface, fontWeight: '700', fontSize: 16 },
});
