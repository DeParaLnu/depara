import type { Classroom, Lesson, Me, NewSubstitution, SubstitutionKind, Teacher } from '../../api';

// F6: логіка форми «Нова заміна» без React і нативних модулів (її перевіряють юніт-тести).
// Правила повторюють перевірки бекенда (backend/src/routes/substitutions.ts), щоб помилку було видно
// до відправки, а не після. Бекенд однаково перевіряє все сам.

export const KIND_OPTIONS: { kind: SubstitutionKind; label: string }[] = [
  { kind: 'CANCELLED', label: 'Скасовано' },
  { kind: 'REPLACED', label: 'Інший викладач' },
  { kind: 'MOVED', label: 'Перенесено' },
  { kind: 'ROOM_CHANGED', label: 'Інша аудиторія' },
];

/** Номери пар для перенесення. Якщо такої пари немає в розкладі дзвінків, бекенд відповість PAIR_NOT_FOUND. */
export const PAIR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

export const MAX_COMMENT = 500;

export type SubstitutionForm = {
  lesson: Lesson | null;
  kind: SubstitutionKind | null;
  teacher: Teacher | null;
  classroom: Classroom | null;
  newDate: string | null; // YYYY-MM-DD
  newPairNumber: number | null;
  comment: string;
};

export const emptyForm = (lesson: Lesson | null = null): SubstitutionForm => ({
  lesson,
  kind: null,
  teacher: null,
  classroom: null,
  newDate: null,
  newPairNumber: null,
  comment: '',
});

export type BuildResult = { ok: true; body: NewSubstitution } | { ok: false; error: string };

/** Тіло POST /substitutions з форми або код помилки (тексти в theme.ts). Зайві для типу поля не відправляються. */
export function buildSubstitution(form: SubstitutionForm): BuildResult {
  const { lesson, kind } = form;
  if (!lesson) return { ok: false, error: 'LESSON_REQUIRED' };
  if (lesson.substitution) return { ok: false, error: 'SUBSTITUTION_EXISTS' };
  if (!kind) return { ok: false, error: 'KIND_REQUIRED' };

  const comment = form.comment.trim();
  if (comment.length > MAX_COMMENT) return { ok: false, error: 'INVALID_COMMENT' };

  const body: NewSubstitution = { lessonId: lesson.id, kind, ...(comment ? { comment } : {}) };
  switch (kind) {
    case 'CANCELLED':
      return { ok: true, body };
    case 'REPLACED':
      if (!form.teacher) return { ok: false, error: 'NEW_TEACHER_REQUIRED' };
      return { ok: true, body: { ...body, newTeacherId: form.teacher.id } };
    case 'ROOM_CHANGED':
      if (!form.classroom) return { ok: false, error: 'NEW_CLASSROOM_REQUIRED' };
      return { ok: true, body: { ...body, newClassroomId: form.classroom.id } };
    case 'MOVED': {
      if (!form.newDate && !form.newPairNumber) return { ok: false, error: 'NEW_DATE_OR_PAIR_REQUIRED' };
      const sameDate = !form.newDate || form.newDate === lesson.date;
      const samePair = !form.newPairNumber || form.newPairNumber === lesson.pairNumber;
      if (sameDate && samePair) return { ok: false, error: 'MOVE_TARGET_SAME_AS_ORIGINAL' };
      return {
        ok: true,
        body: {
          ...body,
          ...(form.newDate ? { newDate: form.newDate } : {}),
          ...(form.newPairNumber ? { newPairNumber: form.newPairNumber } : {}),
          // Перенесена пара може бути й в іншій аудиторії (необовʼязково)
          ...(form.classroom ? { newClassroomId: form.classroom.id } : {}),
        },
      };
    }
  }
}

/** Хто може додавати й скасовувати заміни: староста своєї групи або адмін (як requireRole на бекенді). */
export const canManageSubstitutions = (me: Pick<Me, 'role' | 'groupId'> | undefined): boolean =>
  !!me && (me.role === 'ADMIN' || (me.role === 'HEADMAN' && !!me.groupId));

/** Пари, для яких можна створити заміну: без наявної заміни, за днем і номером. */
export const selectableLessons = (lessons: Lesson[]): Lesson[] =>
  lessons
    .filter((l) => !l.substitution)
    .sort((a, b) => a.date.localeCompare(b.date) || a.pairNumber - b.pairNumber || a.subgroup - b.subgroup);
