-- Вхід переходить з Google на Microsoft Entra: google_sub -> microsoft_oid.
-- Старі значення це id Google-акаунтів, для Microsoft вони безглузді, тому обнуляємо.
-- Користувачів шукаємо за поштою, а oid запишеться при першому вході через Microsoft.
ALTER TABLE "app_user" RENAME COLUMN "google_sub" TO "microsoft_oid";
ALTER TABLE "app_user" ALTER COLUMN "microsoft_oid" DROP NOT NULL;
UPDATE "app_user" SET "microsoft_oid" = NULL;
ALTER INDEX "app_user_google_sub_key" RENAME TO "app_user_microsoft_oid_key";
