// REALOCADO: os componentes do currículo/vitrine agora vivem em components/produtos/pagina/blocos/curriculo-ui.tsx
// (compartilhados admin/aluno pelo editor visual da página). Este arquivo só reexporta para não quebrar importações
// (modulo-detalhe.tsx, components/admin/previa-formato-vitrine.tsx…).
export {
  fold, fmtData, hrefModulo, todasAulas, progresso,
  ProgressoGeral, ModulosVitrine, SecaoModulos, ChamadaCronograma,
  ListaAulas, CardCronograma, Poster, CabecalhoAulas, AulaLinha,
} from '@/components/produtos/pagina/blocos/curriculo-ui'
