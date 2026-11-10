-- Fase 1.11 (endurecimento): índices para os relatórios e a listagem de matrículas.
-- ADITIVA: só cria índices (IF NOT EXISTS), não altera nem apaga dados.

-- lesson_progress: relatórios por aula/curso filtram por lesson_id (a PK é (user_id, lesson_id))
CREATE INDEX IF NOT EXISTS "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");
CREATE INDEX IF NOT EXISTS "lesson_progress_tenant_id_lesson_id_idx" ON "lesson_progress"("tenant_id", "lesson_id");

-- enrollments: listagem/contagem por curso (a única existente é (user_id, course_id))
CREATE INDEX IF NOT EXISTS "enrollments_course_id_idx" ON "enrollments"("course_id");
