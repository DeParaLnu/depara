-- Вхід за поштою й паролем поруч із Microsoft Entra. Колонка необовʼязкова (NULL = пароля немає, вхід лише через
-- Microsoft), тому міграція сумісна з попередньою версією застосунку.
ALTER TABLE "app_user" ADD COLUMN "password_hash" TEXT;
