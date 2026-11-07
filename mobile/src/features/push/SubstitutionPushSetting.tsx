import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { api, type Me } from '../../api';
import { makeStyles, useColors } from '../theme/useTheme';
import { useSession } from '../auth/session';
import { hasPermission, notificationsSupported, requestPermission } from '../reminders/notifications';
import { useMe } from '../schedule/hooks';
import { syncPushToken } from './registration';

// F8/F9: перемикач «Зміни та скасування». Налаштування живе на сервері: саме він вирішує, кому слати пуш.
// Вимкнений перемикач токен пристрою не прибирає, сервер просто не шле цьому користувачу.
export function SubstitutionPushSetting() {
  const styles = useStyles();
  const colors = useColors();
  const token = useSession((s) => s.session?.accessToken);
  const queryClient = useQueryClient();
  const me = useMe();
  // Старі відповіді без поля вважаємо ввімкненими, як і значення за замовчуванням на сервері
  const enabled = me.data?.notifySubstitutions ?? true;

  const save = useMutation({
    mutationKey: ['updateSettings'],
    mutationFn: (notifySubstitutions: boolean) => api.updateSettings(token!, { notifySubstitutions }),
    // Перемикач реагує одразу, а при збої повертається назад
    onMutate: async (notifySubstitutions) => {
      await queryClient.cancelQueries({ queryKey: ['me'] });
      const previous = queryClient.getQueryData<Me>(['me']);
      if (previous) queryClient.setQueryData<Me>(['me'], { ...previous, notifySubstitutions });
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) queryClient.setQueryData(['me'], context.previous);
    },
    onSuccess: (updated: Me) => queryClient.setQueryData(['me'], updated),
  });

  const [missingPermission, setMissingPermission] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!notificationsSupported) return;
    const check = () => {
      void hasPermission().then((granted) => {
        setMissingPermission(!granted);
        if (granted) setDenied(false);
      });
    };
    check();
    // Користувач міг увімкнути сповіщення в налаштуваннях телефону і повернутися
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  const allow = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      setMissingPermission(false);
      if (token) void syncPushToken(token);
    } else {
      setDenied(true);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>Зміни та скасування</Text>
        <Switch
          testID="notify-substitutions"
          accessibilityLabel="Зміни та скасування"
          value={enabled}
          disabled={!me.data || save.isPending}
          onValueChange={(value) => save.mutate(value)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {save.isError ? <Text style={styles.hint}>Не вдалося зберегти. Перевірте звʼязок і спробуйте ще раз.</Text> : null}
      {enabled && denied ? (
        <View style={styles.hintRow} accessibilityRole="alert">
          <Text style={styles.hint}>Сповіщення вимкнені для ДеПари. Увімкніть їх у налаштуваннях телефону.</Text>
          <Pressable testID="push-open-settings" accessibilityRole="link" onPress={() => void Linking.openSettings()} hitSlop={8}>
            <Text style={styles.link}>Відкрити налаштування</Text>
          </Pressable>
        </View>
      ) : enabled && missingPermission ? (
        <View style={styles.hintRow} accessibilityRole="alert">
          <Text style={styles.hint}>Без дозволу на сповіщення повідомлення про заміни не прийдуть.</Text>
          <Pressable testID="push-allow" accessibilityRole="button" onPress={() => void allow()} hitSlop={8}>
            <Text style={styles.link}>Дозволити</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
  block: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  label: { fontSize: 17, color: colors.text, flexShrink: 1 },
  hintRow: { gap: 4 },
  hint: { fontSize: 14, lineHeight: 19, color: colors.textMuted },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
}),
);
