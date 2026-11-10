// Cria/matricula alunos de teste (idempotente via externalRef) pela API de integracao. Roda UMA vez por staging.
// Nao apaga nada. Alunos: load-N@load.invalid (dominio reservado).
//
//   k6 run -e I_KNOW_THIS_IS_STAGING=1 -e API_URL=https://<staging> -e INTEGRATION_KEY=... \
//     -e COURSE_ID=<uuid> -e STUDENTS=1000 -e ACCESS_DAYS=7 load/staging/seed-students.js
import http from 'k6/http';
import { check } from 'k6';
import { API, STUDENTS, assertStaging, emailOf, hdr, ipOf, pace } from './lib.js';

assertStaging();

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { checks: ['rate>0.99'] },
};

export default function () {
  if (!__ENV.INTEGRATION_KEY || !__ENV.COURSE_ID) throw new Error('Defina INTEGRATION_KEY e COURSE_ID');
  for (let i = 0; i < STUDENTS; i++) {
    const r = http.post(
      `${API}/access/enrollments`,
      JSON.stringify({
        email: emailOf(i),
        name: `Carga ${i}`,
        courseId: __ENV.COURSE_ID,
        accessDays: Number(__ENV.ACCESS_DAYS || 7),
        externalRef: `load-seed:${i}`,
      }),
      { headers: { 'Content-Type': 'application/json', ...hdr(__ENV.INTEGRATION_KEY, ipOf(i)) } },
    );
    check(r, { 'matricula 200/201': (x) => x.status === 200 || x.status === 201 });
    pace();
  }
}
