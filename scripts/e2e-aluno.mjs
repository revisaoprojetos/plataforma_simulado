import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const res = []
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
  p.setDefaultTimeout(20000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  // modo aluno é o padrão (email só)
  await p.locator('input[type="email"]').fill('miguellukaalencar@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{})
  await p.waitForTimeout(2000)
  res.push('ALUNO login -> url=' + p.url() + ' (esperado /aluno)')
  await p.screenshot({ path: 'scripts/_e2e-aluno.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
