// Percentis de latência DO SERVIDOR a partir do histograma do /metrics (sem o ruído do gerador de carga).
//   curl -s -H "Authorization: Bearer $METRICS_TOKEN" localhost:3010/metrics | node load/percentiles.cjs v1/progress/heartbeat
// Aceita "v1/progress/heartbeat" (o Git Bash do Windows converteria "/v1/..." em um caminho C:/...)
const arg = process.argv[2] || 'v1/progress/heartbeat';
const route = arg.startsWith('/') ? arg : '/' + arg;
let text = '';
process.stdin.on('data', (d) => (text += d));
process.stdin.on('end', () => {
  const buckets = new Map();
  let total = 0;
  for (const line of text.split('\n')) {
    if (
      !line.startsWith('http_request_duration_seconds_bucket') ||
      !line.includes(`route="${route}"`)
    )
      continue;
    const m = /le="([^"]+)".*\} (\d+)/.exec(line);
    if (!m) continue;
    const le = m[1] === '+Inf' ? Infinity : Number(m[1]);
    buckets.set(le, (buckets.get(le) || 0) + Number(m[2]));
    if (le === Infinity) total += Number(m[2]);
  }
  if (!total) return console.log(`sem dados para a rota ${route}`);
  const edges = [...buckets.keys()].sort((a, b) => a - b);
  const quantile = (q) => {
    const target = q * total;
    let prevLe = 0;
    let prevCount = 0;
    for (const le of edges) {
      const count = buckets.get(le);
      if (count >= target) {
        if (le === Infinity) return `>${prevLe * 1000} ms`;
        const frac = count === prevCount ? 1 : (target - prevCount) / (count - prevCount);
        return `${((prevLe + (le - prevLe) * frac) * 1000).toFixed(1)} ms`; // interpolação linear no balde
      }
      prevLe = le;
      prevCount = count;
    }
  };
  console.log(`rota ${route}: ${total} requisições`);
  for (const q of [0.5, 0.9, 0.95, 0.99]) console.log(`  p${q * 100}: ${quantile(q)}`);
  const under = (s) => ((buckets.get(s) / total) * 100).toFixed(2);
  console.log(`  ≤ 100 ms: ${under(0.1)}%   ≤ 250 ms: ${under(0.25)}%`);
});
