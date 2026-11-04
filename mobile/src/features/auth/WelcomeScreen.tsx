import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';

type Props = { onStart: () => void };

// Приклад пар на ілюстрації (статичний, як на макеті): не дані розкладу
const SAMPLE = [
  { time: '08:30 – 09:50', subject: 'Організація баз даних', tag: 'Лекція', tone: 'primary', shift: false },
  { time: '10:10 – 11:30', subject: 'Операційні системи', tag: 'Далі', tone: 'warning', shift: true },
  { time: '11:50 – 13:10', subject: 'Обчислювальна інформатика', tag: 'Лабораторна', tone: 'blue', shift: false },
] as const;

// Екран привітання перед входом (макет docs/design/03-welcome.png). «Розпочати» веде на вхід (F1).
export function WelcomeScreen({ onStart }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]} testID="welcome-screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logo}>
          <Ionicons name="location-outline" size={44} color="#FFFFFF" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          ДеПара
        </Text>
        <Text style={styles.subtitle}>Розклад ЛНУ завжди з тобою.{'\n'}Навіть без інтернету</Text>

        {/* Ілюстрація: для читачів екрана досить підпису, картки не озвучуємо по одній */}
        <View style={styles.panel} accessible accessibilityLabel="Приклад розкладу на день">
          {SAMPLE.map((l) => (
            <View
              key={l.subject}
              style={[styles.card, l.shift ? styles.cardShift : styles.cardLeft, l.tone === 'warning' && styles.cardNext]}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.time}>{l.time}</Text>
              <Text style={styles.subject}>{l.subject}</Text>
              <View
                style={[
                  styles.tag,
                  l.tone === 'primary' ? styles.tagPrimary : l.tone === 'warning' ? styles.tagWarning : styles.tagBlue,
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    l.tone === 'primary' ? styles.tagPrimaryText : l.tone === 'warning' ? styles.tagWarningText : styles.tagBlueText,
                  ]}
                >
                  {l.tag}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Pressable
        testID="welcome-start"
        accessibilityRole="button"
        onPress={onStart}
        style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>Розпочати</Text>
      </Pressable>
      <Text style={styles.footnote}>Лише для студентів ЛНУ</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 21 },
  content: { alignItems: 'center', paddingBottom: 24 },
  logo: {
    width: 94,
    height: 94,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, lineHeight: 23, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  panel: {
    alignSelf: 'stretch',
    marginTop: 34,
    paddingVertical: 26,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: colors.surfaceTint,
    gap: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    width: '88%',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLeft: { alignSelf: 'flex-start' },
  cardShift: { alignSelf: 'flex-end', marginVertical: -2 },
  cardNext: { borderLeftWidth: 4, borderLeftColor: colors.warning },
  time: { fontSize: 14, fontWeight: '700', color: colors.textTime },
  subject: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.text },
  tag: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 2, marginTop: 2 },
  tagText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  tagPrimary: { backgroundColor: colors.primary },
  tagPrimaryText: { color: '#FFFFFF' },
  tagWarning: { backgroundColor: colors.warningBadge },
  tagWarningText: { color: colors.warningText },
  tagBlue: { backgroundColor: colors.tagBlue },
  tagBlueText: { color: colors.tagBlueText },
  primary: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  footnote: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 14 },
});
