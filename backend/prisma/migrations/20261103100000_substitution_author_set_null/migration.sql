-- Видалення акаунта: заміна належить розкладу групи, а не особі, тому при видаленні автора (старости) заміна
-- лишається, а автор стає NULL. Раніше FK мав ON DELETE RESTRICT і не давав видалити старосту з замінами.
ALTER TABLE "substitution" DROP CONSTRAINT "substitution_created_by_fkey";
ALTER TABLE "substitution" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
