-- F8/F9: перемикач «Зміни та скасування» в профілі. За замовчуванням увімкнено: пуш про заміну це головна функція.
-- Константний DEFAULT у Postgres 11+ не переписує таблицю, тож міграція безпечна і на заповненій базі.
ALTER TABLE "app_user" ADD COLUMN "notify_substitutions" BOOLEAN NOT NULL DEFAULT true;
