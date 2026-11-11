// Mapa nome→ícone lucide dos elementos do catálogo (import nominal: não puxa a biblioteca inteira; NUNCA Sparkles).
import { CalendarDays, Gauge, GalleryHorizontal, Image, LayoutGrid, Megaphone, Minus, MousePointerClick, PanelTop, PlayCircle, Type, Users, Square, type LucideIcon } from 'lucide-react'

const MAPA: Record<string, LucideIcon> = {
  PanelTop, Megaphone, Gauge, PlayCircle, LayoutGrid, CalendarDays, GalleryHorizontal, Image, Type, MousePointerClick, Minus, Users,
}
export const iconeDe = (nome: string): LucideIcon => MAPA[nome] ?? Square
