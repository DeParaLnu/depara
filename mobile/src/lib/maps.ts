import { Linking } from 'react-native';
import type { Building } from '../api';

/** Відкриває в Google Maps маршрут до корпусу (з аудиторією в запиті, якщо вона відома); початок маршруту визначають Maps. */
export function openRoute(building: Building, roomNumber?: string) {
  const destination = encodeURIComponent(
    roomNumber
      ? `${building.name}, ауд. ${roomNumber}, ${building.address} Львів`
      : `${building.name}, ${building.address} Львів`,
  );
  return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
}
