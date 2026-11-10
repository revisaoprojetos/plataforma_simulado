// Teste de carga do heartbeat (RNF10: >= 1.000 heartbeats/s com p95 < 100 ms numa instância).
//
// Cada VU é uma sessão de reprodução enviando 1 heartbeat por segundo (10× mais que um player
// real, que envia a cada ~10 s). Logo 1.000 VUs ≈ 10.000 alunos assistindo ao mesmo tempo.
//
// Uso (ver docs/operacao.md):
//   docker compose -f docker-compose.yml -f docker-compose.load.yml up -d api
//   docker run --rm -i --network gerenciador_video_default -e API=http://api:3000 -e VUS=1000 \
//     -e METRICS_TOKEN=... grafana/k6 run - < load/heartbeat.js
//
// O setup cria alunos de teste (load-N@empresa-a.local), matricula e abre as sessões. Remova-os
// depois com load/cleanup.sql.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3010';
const VUS = Number(__ENV.VUS || 1000);
const DURATION = __ENV.DURATION || '60s';
const USERS = Number(__ENV.USERS || 25); // sessões por usuário = VUS / USERS (limite de telas é elevado no override)
const TENANT = __ENV.TENANT || 'empresa-a';
const ORIGIN = __ENV.ORIGIN || 'http://localhost:5173';
const JSON_H = { 'Content-Type': 'application/json' };

const accepted = new Counter('heartbeats_accepted');

export const options = {
  scenarios: {
    heartbeats: { executor: 'constant-vus', vus: VUS, duration: DURATION, gracefulStop: '5s' },
  },
  setupTimeout: '10m',
  thresholds: {
    // Meta do projeto
    'http_req_duration{name:heartbeat}': ['p(95)<100'],
    'http_req_failed{name:heartbeat}': ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

// `ip` simula o cliente por trás do proxy (X-Forwarded-For, com TRUST_PROXY=1): cada "aluno" tem o seu IP,
// senão os ~40 logins do setup partiriam de um IP só e bateriam no limite de login por IP (30/10 min).
const post = (path, body, token, name, ip) =>
  http.post(`${API}/v1${path}`, JSON.stringify(body), {
    headers: {
      ...JSON_H,
      Origin: ORIGIN,
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    tags: { name },
  });

function login(email, password, ip) {
  const r = post('/auth/login', { tenant: TENANT, email, password }, null, 'setup', ip);
  return r.status === 200 ? r.json('accessToken') : null;
}

export function setup() {
  const admin = login('admin@empresa-a.local', 'dev12345', '10.9.0.1');
  const prof = login('professor@empresa-a.local', 'dev12345', '10.9.0.2');
  if (!admin || !prof) throw new Error('Rode npm run db:seed antes (admin/professor da empresa-a)');

  const courses = http
    .get(`${API}/v1/courses`, { headers: { Authorization: `Bearer ${prof}` } })
    .json('data');
  const course = courses[0];
  const modules = http
    .get(`${API}/v1/courses/${course.id}/modules`, { headers: { Authorization: `Bearer ${prof}` } })
    .json();
  const lesson = modules.flatMap((m) => m.lessons).find((l) => l.videoId);
  if (!lesson) throw new Error('Nenhuma aula com vídeo pronto (npm run upload:sample)');

  // Alunos de teste (idempotente: 409 = já existe)
  const sessions = [];
  const perUser = Math.ceil(VUS / USERS);
  for (let u = 0; u < USERS; u++) {
    const email = `load-${u}@empresa-a.local`;
    const created = post(
      '/users',
      { email, name: `Carga ${u}`, password: 'senha-de-carga-1', role: 'aluno' },
      admin,
      'setup',
    );
    if (created.status === 201) {
      post(`/courses/${course.id}/enrollments`, { userId: created.json('id') }, prof, 'setup');
    }
    const token = login(email, 'senha-de-carga-1', `10.8.${u}.1`);
    if (!token) throw new Error(`login falhou para ${email}`);
    for (let s = 0; s < perUser && sessions.length < VUS; s++) {
      const r = post(`/lessons/${lesson.id}/playback`, {}, token, 'setup');
      if (r.status !== 200) throw new Error(`playback ${r.status}: ${r.body}`);
      sessions.push(r.json('playbackToken'));
    }
  }
  console.log(
    `setup ok: ${sessions.length} sessões abertas em ${USERS} alunos (aula ${lesson.id})`,
  );
  return { sessions };
}

let seq = 0;
let phased = false;

export default function (data) {
  // Jogadores reais não têm fase alinhada. Sem este atraso aleatório inicial, as VUs disparam todas no
  // mesmo instante a cada segundo (rajada de VUS requisições) e o p95 mede a rajada, não o servidor.
  if (!phased) {
    sleep(Math.random());
    phased = true;
  }
  const token = data.sessions[(__VU - 1) % data.sessions.length];
  seq += 1;
  // 1 s de vídeo por segundo real, a 1×: sempre dentro da regra de "trecho assistido".
  const started = Date.now();
  const r = http.post(
    `${API}/v1/progress/heartbeat`,
    JSON.stringify({ seq, position: seq, rate: 1, quality: '720p', device: 'carga' }),
    { headers: { ...JSON_H, Authorization: `Bearer ${token}` }, tags: { name: 'heartbeat' } },
  );
  const ok = check(r, { 'heartbeat 204': (res) => res.status === 204 });
  if (ok) accepted.add(1);
  sleep(Math.max(0, 1 - (Date.now() - started) / 1000));
}

export function teardown() {
  const mt = __ENV.METRICS_TOKEN;
  if (!mt) return;
  // Quanto sobrou na fila logo ao parar, e depois de dar tempo ao consolidador
  const queue = () => {
    const t = http.get(`${API}/metrics`, { headers: { Authorization: `Bearer ${mt}` } }).body;
    const m = /progress_events_queue_length (\d+)/.exec(t);
    return m ? Number(m[1]) : -1;
  };
  console.log(`fila de progresso ao parar: ${queue()}`);
  sleep(15);
  console.log(`fila de progresso 15 s depois: ${queue()}`);
}
