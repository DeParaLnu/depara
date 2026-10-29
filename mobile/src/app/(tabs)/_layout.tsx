import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';

// Розміри з макета: іконка 22 px, підпис 11 px, вкладка ~65 px без безпечної зони
const ICON_SIZE = 22;
const ICON_BOX = 24;
const LABEL_LINE = 14;
const LABEL_GAP = 2;
const BAR_PADDING_TOP = 8;
const BAR_PADDING_BOTTOM = 6;
// Внутрішній відступ кнопки вкладки в навігаторі (зверху і знизу)
const ITEM_PADDING = 5;
// Верхня лінія панелі (hairline, не більше 1 px) теж займає висоту
const BORDER = 1;

// Нижня навігація з макетів: Сьогодні, Тиждень, Аудиторії, Профіль
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  // iOS 13+ не збільшує підписи вкладок (показує їх великими при довгому натисканні),
  // а Android збільшує і шрифт, і висоту рядка: висоту вкладки рахуємо від неї,
  // інакше підпис обрізається знизу
  const labelLine = LABEL_LINE * (Platform.OS === 'ios' ? 1 : Math.max(fontScale, 1));
  const height =
    BORDER +
    BAR_PADDING_TOP +
    ITEM_PADDING * 2 +
    ICON_BOX +
    LABEL_GAP +
    labelLine +
    BAR_PADDING_BOTTOM;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: LABEL_LINE,
          fontWeight: '700',
          marginTop: LABEL_GAP,
        },
        // За замовчуванням навігатор відводить під іконку 31×28 px, і підпис не влазить
        tabBarIconStyle: { height: ICON_BOX },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Math.ceil(height) + insets.bottom,
          paddingTop: BAR_PADDING_TOP,
          paddingBottom: insets.bottom + BAR_PADDING_BOTTOM,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Сьогодні',
          tabBarButtonTestID: 'tab-today',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: 'Тиждень',
          tabBarButtonTestID: 'tab-week',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: 'Аудиторії',
          tabBarButtonTestID: 'tab-rooms',
          tabBarIcon: ({ color }) => <Ionicons name="search" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профіль',
          tabBarButtonTestID: 'tab-profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
