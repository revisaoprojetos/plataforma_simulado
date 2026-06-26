import { CadernosManager } from '@/components/aluno/cadernos-manager'

export default function AlunoCadernosPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadernos de estudo</h1>
        <p className="text-muted-foreground">Organize questões em cadernos para revisar depois.</p>
      </div>
      <CadernosManager />
    </div>
  )
}
