-- Ключ пари: (група, дата, номер пари, підгрупа) замість ключа з предметом.
-- Раніше виправлення назви предмета в новому імпорті додавало другу пару в той самий слот. Такі дублі, якщо вони
-- вже є, прибираємо перед створенням унікального індексу: лишаємо пару із заміною (щоб не втратити заміну
-- старости), а серед решти найсвіжішу за updated_at.
DELETE FROM "lesson" AS l
USING (
  SELECT
    x."id",
    ROW_NUMBER() OVER (
      PARTITION BY x."group_id", x."date", x."pair_number", x."subgroup"
      ORDER BY EXISTS (SELECT 1 FROM "substitution" s WHERE s."lesson_id" = x."id") DESC, x."updated_at" DESC, x."id"
    ) AS rn
  FROM "lesson" x
) d
WHERE l."id" = d."id" AND d.rn > 1;

DROP INDEX "lesson_group_id_date_pair_number_subgroup_subject_key";
CREATE UNIQUE INDEX "lesson_group_id_date_pair_number_subgroup_key" ON "lesson"("group_id", "date", "pair_number", "subgroup");
