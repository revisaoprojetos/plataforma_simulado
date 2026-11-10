import { PublishStatus, Role } from '@prisma/client';

/** Regras puras de acesso (sem I/O) — fáceis de testar e reutilizadas por REST e MCP. */
export interface PolicyUser {
  id: string;
  role: Role;
}

export interface CourseFacts {
  ownerId: string | null;
  status: PublishStatus;
}

/** Admin da empresa gerencia tudo; professor gerencia só os cursos de que é dono. */
export function canManageCourse(user: PolicyUser, course: CourseFacts): boolean {
  return user.role === 'admin' || (user.role === 'professor' && course.ownerId === user.id);
}

/** Quem gerencia vê tudo; aluno vê apenas curso publicado em que está matriculado. */
export function canViewCourse(user: PolicyUser, course: CourseFacts, enrolled: boolean): boolean {
  return canManageCourse(user, course) || (enrolled && course.status === 'published');
}

/** Aluno só vê aula publicada de curso que pode ver. */
export function canViewLesson(
  user: PolicyUser,
  course: CourseFacts,
  lessonStatus: PublishStatus,
  enrolled: boolean,
): boolean {
  return (
    canManageCourse(user, course) ||
    (canViewCourse(user, course, enrolled) && lessonStatus === 'published')
  );
}
