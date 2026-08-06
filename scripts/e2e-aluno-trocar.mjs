import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.setDefaultTimeout(20000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
  await p.locator('input[type="email"]').fill('miguellukaalencar@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(2500)
  res.push('logado em: ' + p.url())
  // abre o menu do avatar (topbar)
  await p.locator('header button').filter({ has: p.locator('.rounded-full, [class*=Avatar]') }).last().click().catch(()=>{})
  await p.waitForTimeout(300)
  // fallback: clica no avatar por trigger de dropdown
  if (!(await p.getByText(/Trocar de plataforma/i).count())) {
    await p.locator('header').getByRole('button').last().click().catch(()=>{}); await p.waitForTimeout(300)
  }
  const temItem = await p.getByText(/Trocar de plataforma/i).count()
  res.push('item "Trocar de plataforma" visível: ' + temItem)
  if (temItem) {
    await p.getByText(/Trocar de plataforma/i).first().click(); await p.waitForTimeout(1500)
    const modalTitulo = await p.getByRole('heading', { name: /Trocar de plataforma/i }).count()
    const conteudo = (await p.locator('body').innerText()).match(/(só tem acesso a esta plataforma|entra na outra plataforma)/i)
    res.push('modal aberto: ' + modalTitulo + ' | conteúdo: ' + (conteudo ? conteudo[0] : 'N/A'))
    await p.screenshot({ path: 'scripts/_e2e-aluno-trocar.png' })
  }
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
