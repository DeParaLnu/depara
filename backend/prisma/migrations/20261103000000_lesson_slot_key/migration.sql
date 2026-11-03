-- Ключ пари: (група, дата, номер пари, підгрупа) замість ключа з предметом.
-- Раніше виправлення назви предмета в новому імпорті додавало другу пару в той самий слот. Такі дублі, якщо вони
-- вже є, зводимо до однієї пари перед створенням унікального індексу:
--  * лишається пара із заміною старости (її id тримає заміну), а якщо замін кілька, то пара з НАЙСВІЖІШОЮ ЗАМІНОЮ
--    за substitution.updated_at (порядок оновлення пар тут не важить: стара пара може мати новішу заміну);
--  * поля (предмет, тип, викладач, аудиторія...) беруться з НАЙСВІЖІШОЇ пари слота: це остання версія розкладу,
--    тож виправлена назва не губиться, навіть коли заміна висіла на старій версії;
--  * якщо заміни були на кількох дублях одного слота, зберегти можна лише одну (одна заміна на пару):
--    решта каскадно видаляється, про кожен такий слот міграція пише NOTICE.
CREATE TEMP TABLE "_lesson_slot_dups" AS
SELECT
  l."id", l."group_id", l."date", l."pair_number", l."subgroup",
  l."subject", l."type", l."audience", l."teacher_id", l."classroom_id", l."online_url", l."updated_at",
  (SELECT MAX(s."updated_at") FROM "substitution" s WHERE s."lesson_id" = l."id") AS sub_updated_at,
  EXISTS (SELECT 1 FROM "substitution" s WHERE s."lesson_id" = l."id") AS has_sub,
  ROW_NUMBER() OVER (
    PARTITION BY l."group_id", l."date", l."pair_number", l."subgroup" ORDER BY l."updated_at" DESC, l."id"
  ) AS recency,
  COUNT(*) OVER (PARTITION BY l."group_id", l."date", l."pair_number", l."subgroup") AS slot_size
FROM "lesson" l;

DELETE FROM "_lesson_slot_dups" WHERE slot_size = 1;

-- Яка пара слота лишається: із заміною (з найсвіжішою за updated_at заміною), інакше найсвіжіша пара
CREATE TEMP TABLE "_lesson_slot_keep" AS
SELECT DISTINCT ON ("group_id", "date", "pair_number", "subgroup") "id" AS keep_id, "group_id", "date", "pair_number", "subgroup"
FROM "_lesson_slot_dups"
ORDER BY "group_id", "date", "pair_number", "subgroup", has_sub DESC, sub_updated_at DESC NULLS LAST, recency, "id";

DO $$
DECLARE slot RECORD;
BEGIN
  FOR slot IN
    SELECT "group_id", "date", "pair_number", "subgroup", COUNT(*) FILTER (WHERE has_sub) AS subs
    FROM "_lesson_slot_dups" GROUP BY "group_id", "date", "pair_number", "subgroup" HAVING COUNT(*) FILTER (WHERE has_sub) > 1
  LOOP
    RAISE NOTICE 'слот group=% date=% pair=% subgroup=%: замін було %, збережено одну (найсвіжішу)',
      slot."group_id", slot."date", slot."pair_number", slot."subgroup", slot.subs;
  END LOOP;
END $$;

-- Спершу видаляємо зайві дублі (поки старий унікальний індекс ще з предметом, перенесена назва збіглася б із дублем),
-- потім переносимо поля найсвіжішої версії з тимчасової таблиці на пару, що лишилась
DELETE FROM "lesson" WHERE "id" IN (SELECT "id" FROM "_lesson_slot_dups") AND "id" NOT IN (SELECT keep_id FROM "_lesson_slot_keep");

UPDATE "lesson" AS k
SET "subject" = n."subject", "type" = n."type", "audience" = n."audience", "teacher_id" = n."teacher_id",
    "classroom_id" = n."classroom_id", "online_url" = n."online_url", "updated_at" = n."updated_at"
FROM "_lesson_slot_keep" keep
JOIN "_lesson_slot_dups" n
  ON n."group_id" = keep."group_id" AND n."date" = keep."date" AND n."pair_number" = keep."pair_number"
 AND n."subgroup" = keep."subgroup" AND n.recency = 1
WHERE k."id" = keep.keep_id AND n."id" <> keep.keep_id;


DROP TABLE "_lesson_slot_dups";
DROP TABLE "_lesson_slot_keep";

DROP INDEX "lesson_group_id_date_pair_number_subgroup_subject_key";
CREATE UNIQUE INDEX "lesson_group_id_date_pair_number_subgroup_key" ON "lesson"("group_id", "date", "pair_number", "subgroup");
