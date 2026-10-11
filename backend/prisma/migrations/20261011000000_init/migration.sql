-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'HEADMAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('LECTURE', 'PRACTICE', 'LAB', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('STREAM', 'COMBINED', 'GROUP');

-- CreateEnum
CREATE TYPE "SubstitutionKind" AS ENUM ('CANCELLED', 'REPLACED', 'MOVED', 'ROOM_CHANGED');

-- CreateTable
CREATE TABLE "faculty" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_group" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "course" INTEGER NOT NULL,
    "faculty_id" UUID NOT NULL,

    CONSTRAINT "study_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "google_sub" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "group_id" UUID,
    "subgroup" INTEGER NOT NULL DEFAULT 0,
    "reminder_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom" (
    "id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,

    CONSTRAINT "classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pair_time" (
    "pair_number" INTEGER NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,

    CONSTRAINT "pair_time_pkey" PRIMARY KEY ("pair_number")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "pair_number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "teacher_id" UUID,
    "type" "LessonType" NOT NULL DEFAULT 'OTHER',
    "audience" "Audience" NOT NULL DEFAULT 'GROUP',
    "subgroup" INTEGER NOT NULL DEFAULT 0,
    "classroom_id" UUID,
    "online_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitution" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "kind" "SubstitutionKind" NOT NULL,
    "new_teacher_id" UUID,
    "new_classroom_id" UUID,
    "new_date" DATE,
    "new_pair_number" INTEGER,
    "comment" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "substitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_group_faculty_id_code_key" ON "study_group"("faculty_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_google_sub_key" ON "app_user"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "notification_token_fcm_token_key" ON "notification_token"("fcm_token");

-- CreateIndex
CREATE INDEX "notification_token_user_id_idx" ON "notification_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "building_code_key" ON "building"("code");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_building_id_number_key" ON "classroom"("building_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_full_name_key" ON "teacher"("full_name");

-- CreateIndex
CREATE INDEX "lesson_group_id_date_idx" ON "lesson"("group_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_group_id_date_pair_number_subgroup_subject_key" ON "lesson"("group_id", "date", "pair_number", "subgroup", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "substitution_lesson_id_key" ON "substitution"("lesson_id");

-- AddForeignKey
ALTER TABLE "study_group" ADD CONSTRAINT "study_group_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_token" ADD CONSTRAINT "notification_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom" ADD CONSTRAINT "classroom_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_pair_number_fkey" FOREIGN KEY ("pair_number") REFERENCES "pair_time"("pair_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_new_teacher_id_fkey" FOREIGN KEY ("new_teacher_id") REFERENCES "teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_new_classroom_id_fkey" FOREIGN KEY ("new_classroom_id") REFERENCES "classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_new_pair_number_fkey" FOREIGN KEY ("new_pair_number") REFERENCES "pair_time"("pair_number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

