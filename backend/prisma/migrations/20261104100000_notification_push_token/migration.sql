-- F8: пуші йдуть через Expo Push, тож у таблиці зберігається Expo push-токен (ExponentPushToken[...]), а не токен FCM.
-- Таблиця досі не використовувалась, перейменування лише змінює метадані.
ALTER TABLE "notification_token" RENAME COLUMN "fcm_token" TO "push_token";
ALTER INDEX "notification_token_fcm_token_key" RENAME TO "notification_token_push_token_key";
