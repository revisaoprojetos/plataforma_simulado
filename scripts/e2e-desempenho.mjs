import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res=[]
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); p.setDefaultTimeout(20000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
  await p.locator('input[type="email"]').fill('joao@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(1500)
  // navega pelo item da sidebar
  const item = await p.getByRole('link', { name: /Meu Desempenho/i }).count()
  res.push('item sidebar "Meu Desempenho": ' + item)
  await p.goto('http://localhost:3000/aluno/desempenho', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  const txt = await p.locator('main').innerText()
  res.push('KPIs presentes: ' + /Simulados feitos|Nota média|Acerto médio|desempenho aparecerá/i.test(txt))
  res.push('gráfico disciplina (aluno×turma): ' + /Acerto por disciplina|Evolução/i.test(txt))
  res.push('trecho: ' + txt.replace(/\s+/g,' ').slice(0, 160))
  await p.screenshot({ path: 'scripts/_e2e-desempenho.png', fullPage: true })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
