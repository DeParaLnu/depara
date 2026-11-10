import type { Room } from '../../api';

/**
 * Єдиний підпис аудиторії для всіх екранів: «Корпус Т · ауд. 218».
 * Номер і код корпусу приходять з API вже в одному вигляді (backend/src/lib/rooms.ts), тут лише порядок і слова.
 * Сервер складає той самий рядок для пушів (roomTitle у backend/src/lib/rooms.ts).
 */
export const roomTitle = (room: Pick<Room, 'number' | 'building'>) => `Корпус ${room.building.code} · ауд. ${room.number}`;
