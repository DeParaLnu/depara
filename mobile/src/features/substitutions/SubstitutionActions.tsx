import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import type { Lesson } from '../../api';
import { reportError } from '../../lib/errors';
import { colors, errorText } from '../../theme';
import { useCanManageSubstitutions, useDeleteSubstitution } from './hooks';

type Props = { lesson: Lesson; onClose: () => void };

// Кнопки старости в деталях пари: «Додати заміну» або «Скасувати заміну». Студент їх не бачить
export function SubstitutionActions({ lesson, onClose }: Props) {
  const canManage = useCanManageSubstitutions();
  const remove = useDeleteSubstitution();
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  const sub = lesson.substitution;
  if (!sub) {
    return (
      <Pressable
        testID="add-substitution-button"
        accessibilityRole="button"
        onPress={() => {
          onClose();
          router.push({ pathname: '/substitution', params: { date: lesson.date, lessonId: lesson.id } });
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.addText}>Додати заміну</Text>
      </Pressable>
    );
  }

  const cancel = async () => {
    setError(null);
    try {
      await remove.mutateAsync(sub.id);
      onClose();
    } catch (e) {
      setError(errorText(reportError('substitution', e)));
    }
  };
  const confirm = () =>
    Alert.alert('Скасувати заміну?', 'Пара повернеться до звичайного вигляду в розкладі групи.', [
      { text: 'Ні', style: 'cancel' },
      { text: 'Скасувати заміну', style: 'destructive', onPress: () => void cancel() },
    ]);

  return (
    <>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        testID="cancel-substitution-button"
        accessibilityRole="button"
        accessibilityState={{ disabled: remove.isPending, busy: remove.isPending }}
        disabled={remove.isPending}
        onPress={confirm}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {remove.isPending ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.cancelText}>Скасувати заміну</Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  pressed: { backgroundColor: colors.chip },
  addText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  cancelText: { fontSize: 17, fontWeight: '700', color: colors.danger },
  error: { color: colors.error, fontSize: 15, lineHeight: 20, marginTop: 12, textAlign: 'center' },
});
