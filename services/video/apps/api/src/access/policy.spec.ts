import { canManageCourse, canViewCourse, canViewLesson } from './policy';

const course = { ownerId: 'prof-1', status: 'published' as const };
const draft = { ownerId: 'prof-1', status: 'draft' as const };

const admin = { id: 'a', role: 'admin' as const };
const owner = { id: 'prof-1', role: 'professor' as const };
const otherProf = { id: 'prof-2', role: 'professor' as const };
const student = { id: 's', role: 'aluno' as const };
const platform = { id: 'p', role: 'platform_admin' as const };

describe('policy', () => {
  it('gerencia: admin sempre; professor só se for dono; aluno e platform_admin nunca', () => {
    expect(canManageCourse(admin, course)).toBe(true);
    expect(canManageCourse(owner, course)).toBe(true);
    expect(canManageCourse(otherProf, course)).toBe(false);
    expect(canManageCourse(student, course)).toBe(false);
    expect(canManageCourse(platform, course)).toBe(false);
  });

  it('vê curso: aluno só se matriculado e publicado', () => {
    expect(canViewCourse(student, course, true)).toBe(true);
    expect(canViewCourse(student, course, false)).toBe(false);
    expect(canViewCourse(student, draft, true)).toBe(false);
    expect(canViewCourse(otherProf, course, true)).toBe(true); // professor matriculado como aluno de outro curso
    expect(canViewCourse(otherProf, course, false)).toBe(false);
  });

  it('vê aula: rascunho só para quem gerencia', () => {
    expect(canViewLesson(student, course, 'published', true)).toBe(true);
    expect(canViewLesson(student, course, 'draft', true)).toBe(false);
    expect(canViewLesson(owner, course, 'draft', false)).toBe(true);
    expect(canViewLesson(admin, draft, 'draft', false)).toBe(true);
  });
});
