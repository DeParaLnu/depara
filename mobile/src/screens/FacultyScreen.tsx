import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, api, type Group } from '../api';
import { colors, errorText } from '../theme';

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

type Props = { accessToken: string };

// F2 (початок): вибір факультету після першого входу
export function FacultyScreen({ accessToken }: Props) {
  const [faculties, setFaculties] = useState<Faculty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setFaculties(null);
    try {
      setFaculties(toFaculties(await api.groups(accessToken)));
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'UNKNOWN'));
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Оберіть факультет</Text>
      <Text style={styles.subtitle}>Далі оберете свою групу, щоб бачити розклад</Text>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Спробувати ще раз"
            onPress={load}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Спробувати ще раз</Text>
          </Pressable>
        </View>
      ) : faculties === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          testID="faculty-list"
          data={faculties}
          keyExtractor={(f) => f.name}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{groupsLabel(item.groups)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.subtitle}>Факультетів поки немає</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 80, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 20 },
  list: { gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  cardPressed: { borderColor: colors.primary },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  error: { fontSize: 15, color: colors.error, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.surface, fontWeight: '600' },
});
