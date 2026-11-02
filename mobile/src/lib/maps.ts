import { Linking } from 'react-native';
import type { Building } from '../api';

/**
 * Відкриває в Google Maps маршрут до корпусу; початок маршруту визначають Maps.
 * У запиті лише адреса і місто: назва корпусу («Корпус на Тарнавського») і номер аудиторії
 * Google не знає як місця, і з ними пошук знаходить не те або нічого.
 */
export function openRoute(building: Building) {
  const destination = encodeURIComponent(`${building.address || building.name}, Львів`);
  return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
}
