import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const b = await chromium.launch({ headless: true }); const res = []
try {
  // --- ALUNO: exportar meus dados (download JSON) ---
  const p = await b.newPage({ viewport: { width: 1300, height: 900 }, acceptDownloads: true }); p.setDefaultTimeout(25000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
  await p.locator('input[type="email"]').fill('joao@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(1500)
  await p.goto('http://localhost:3000/aluno/privacidade', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  res.push('ALUNO privacidade tem botões: ' + /Baixar em JSON|Solicitar exclusão/i.test(await p.locator('main').innerText()))
  const [dl] = await Promise.all([ p.waitForEvent('download', { timeout: 20000 }), p.getByRole('button', { name: /Baixar em JSON/i }).click() ])
  const path = await dl.path()
  const json = JSON.parse(readFileSync(path, 'utf8'))
  res.push('EXPORT JSON: titular=' + (json.titular?.nome||'?') + ' email=' + (json.titular?.email||'?') + ' simulados=' + (json.simulados?.length ?? '?'))

  // --- ADMIN: página LGPD ---
  const a = await b.newPage({ viewport: { width: 1300, height: 900 } }); a.setDefaultTimeout(25000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(800)
  await a.getByRole('button', { name: /admin/i }).first().click(); await a.waitForTimeout(400)
  await a.locator('input[type="email"]').fill('admin@teste.com'); await a.locator('input[type="password"]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click()
  await a.waitForURL(/\/admin/, { timeout: 25000 }).catch(()=>{}); await a.waitForTimeout(1500)
  await a.goto('http://localhost:3000/admin/lgpd', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2500)
  const at = await a.locator('main, body').innerText()
  res.push('ADMIN lgpd carrega: ' + /direitos do titular/i.test(at))
  res.push('ADMIN aviso migração (esperado, migração não aplicada): ' + /Aplique a migração|20260730000002/i.test(at))
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,220)) } finally { console.log(res.join('\n')); await b.close() }
