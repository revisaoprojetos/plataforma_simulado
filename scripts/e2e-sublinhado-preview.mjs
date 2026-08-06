import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const a = await b.newPage({ viewport: { width: 1300, height: 950 }, deviceScaleFactor: 1.4 }); a.setDefaultTimeout(30000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(700)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(300)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  await a.goto('http://localhost:3000/admin/questoes/nova', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2500)
  const ta = a.locator('#enunciado')
  await ta.fill('Termo com <u>palavra sublinhada</u>, também **negrito** e *itálico* para comparação.')
  await a.waitForTimeout(300)
  // clica no botão "Prévia" do editor do enunciado
  await a.getByRole('button', { name: /Prévia/i }).first().click().catch(()=>{}); await a.waitForTimeout(700)
  // conta elementos <u> renderizados na prévia
  const uCount = await a.locator('u').count()
  const strongCount = await a.locator('strong').count()
  res.push('elementos <u> na página: ' + uCount)
  res.push('elementos <strong> na página: ' + strongCount)
  const underlinedText = await a.locator('u').filter({ hasText: 'palavra sublinhada' }).count()
  res.push('tem <u>palavra sublinhada</u>: ' + underlinedText)
  await a.screenshot({ path: 'scripts/_sublinhado_preview.png', fullPage: false })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,300)) } finally { console.log(res.join('\n')); await b.close() }
