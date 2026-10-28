import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Building, Classroom } from '../../api';
import { StateView } from '../../components/StateView';
import { colors, errorText } from '../../theme';

export type RoomsState =
  | { kind: 'loading' }
  | { kind: 'ready'; rooms: Classroom[] }
  | { kind: 'error'; code: string };

type Props = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedBuilding: string | undefined;
  onSelectBuilding: (building: string | undefined) => void;
  /** Довідник корпусів з GET /buildings; поки не завантажений, чіпи й блок «Корпуси» не показуємо */
  buildings: Building[];
  /** Довідник корпусів не завантажився: показуємо повідомлення з повтором замість мовчки сховати чіпи */
  buildingsFailed?: boolean;
  onRetryBuildings?: () => void;
  state: RoomsState;
  onRetry?: () => void;
};

export function RoomsView({
  searchQuery,
  onSearchChange,
  selectedBuilding,
  onSelectBuilding,
  buildings,
  buildingsFailed = false,
  onRetryBuildings,
  state,
  onRetry,
}: Props) {
  const insets = useSafeAreaInsets();
  const [isFocused, setIsFocused] = useState(false);

  const openMap = (building: Building, roomNumber?: string) => {
    const destination = encodeURIComponent(
      roomNumber
        ? `${building.name}, ауд. ${roomNumber}, ${building.address} Львів`
        : `${building.name}, ${building.address} Львів`,
    );
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  };

  const safeId = (label: string) => label.replace(/\//g, '-');

  // Визначаємо перелік корпусів для блоку «КОРПУСИ»
  const visibleBuildings = selectedBuilding
    ? buildings.filter((b) => b.code.toLowerCase() === selectedBuilding.toLowerCase())
    : buildings;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]} testID="rooms-screen">
      <Text style={styles.title} accessibilityRole="header">
        Аудиторії
      </Text>

      {/* Поле пошуку */}
      <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          testID="rooms-search-input"
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Пошук аудиторії"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => onSearchChange('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Очистити пошук"
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {buildingsFailed ? (
        <Pressable
          testID="buildings-error"
          accessibilityRole="button"
          accessibilityLabel="Не вдалося завантажити корпуси. Спробувати ще раз"
          onPress={onRetryBuildings}
          style={styles.buildingsError}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.buildingsErrorText}>Не вдалося завантажити корпуси. Спробувати ще раз</Text>
        </Pressable>
      ) : null}

      {/* Фільтр-чіпи корпусів */}
      <View style={styles.chipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
          <Pressable
            onPress={() => onSelectBuilding(undefined)}
            style={[styles.chip, !selectedBuilding && styles.chipActive]}
            accessibilityRole="button"
            accessibilityLabel="Усі корпуси"
          >
            <Text style={[styles.chipText, !selectedBuilding && styles.chipTextActive]}>Усі</Text>
          </Pressable>
          {buildings.map((b) => {
            const isActive = selectedBuilding?.toLowerCase() === b.code.toLowerCase();
            return (
              <Pressable
                key={b.code}
                onPress={() => onSelectBuilding(isActive ? undefined : b.code)}
                style={[styles.chip, isActive && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Корпус ${b.code}`}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>Корпус {b.code}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Результати пошуку */}
      {state.kind === 'loading' ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.centerContainer} testID="rooms-error">
          <StateView
            icon="alert-circle-outline"
            title="Не вдалося завантажити"
            description={errorText(state.code)}
            actionLabel="Спробувати знову"
            onAction={onRetry}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.resultsContainer}
          contentContainerStyle={styles.resultsContent}
          testID="rooms-results"
          showsVerticalScrollIndicator={false}
        >
          {state.rooms.length === 0 ? (
            <StateView
              icon="search-outline"
              title="Нічого не знайдено"
              description="Перевірте правильність номера аудиторії або оберіть інший корпус"
            />
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>АУДИТОРІЇ</Text>
              {state.rooms.map((room, idx) => {
                const idStr = safeId(room.label);
                return (
                  <View key={room.id}>
                    <TouchableOpacity
                      testID={`room-item-${idStr}`}
                      onPress={() => openMap(room.building, room.number)}
                      style={styles.roomRow}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Аудиторія ${room.number}, корпус ${room.building.code}, ${room.building.address}`}
                    >
                      <View testID="room-item" style={styles.roomItemInner}>
                        <View style={styles.iconBox}>
                          <Ionicons name="enter-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemTitle}>ауд. {room.number}</Text>
                          <Text testID={`room-building-${idStr}`} style={styles.itemSubtitle}>
                            Корпус {room.building.code} · {room.building.address}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#C4CBD4" />
                      </View>
                    </TouchableOpacity>
                    {idx < state.rooms.length - 1 ? <View style={styles.separator} /> : null}
                  </View>
                );
              })}
            </View>
          )}

          {/* Секція «КОРПУСИ» за макетом */}
          {visibleBuildings.length > 0 ? (
            <View style={[styles.section, styles.buildingsSection]}>
              <Text style={styles.sectionTitle}>КОРПУСИ</Text>
              {visibleBuildings.map((building, idx) => (
                <View key={building.code}>
                  <TouchableOpacity
                    onPress={() => openMap(building)}
                    style={styles.roomRow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${building.name}, ${building.address}`}
                  >
                    <View style={styles.roomItemInner}>
                      <View style={styles.iconBox}>
                        <Ionicons name="business-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemTitle}>{building.name}</Text>
                        <Text style={styles.itemSubtitle}>{building.address}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#C4CBD4" />
                    </View>
                  </TouchableOpacity>
                  {idx < visibleBuildings.length - 1 ? <View style={styles.separator} /> : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buildingsError: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingVertical: 4 },
  buildingsErrorText: { fontSize: 14, lineHeight: 19, color: colors.primary, fontWeight: '600' },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  searchBox: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchBoxFocused: {
    borderColor: colors.accent,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  chipsRow: {
    marginBottom: 16,
  },
  chipsContent: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.chip,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  buildingsSection: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  roomRow: {
    paddingVertical: 12,
  },
  roomItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF5FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
