import {
  Briefcase, GraduationCap, BookOpen, BookMarked, Scale, Gavel, Shield, Landmark, Crown,
  Trophy, Medal, Award, Star, Swords, Target, Rocket, Brain, BadgeCheck, Flame, Zap,
  // variações "bem diferentes"
  Coffee, Heart, Gem, Anchor, Feather, Compass, Globe, Lightbulb, Key, Sword, Castle, Leaf,
  Mountain, Sun, Moon, Guitar, Camera, Palette, Ghost, Cat, Dog, Bird, Dumbbell, Hammer,
  Wrench, Atom, FlaskConical, Bike, Pizza, Cake, Sprout, PawPrint, Wand2, Music, Rabbit,
  Diamond, Snowflake, Umbrella, Sailboat,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícones disponíveis para os CARGOS da gamificação (editável no admin, por cargo). A escolha é
 * guardada como string (`TituloNivel.icone`) e resolvida aqui — assim o valor salvo no banco é
 * estável e portável (não depende do bundle). Conjunto curado p/ carreira jurídica/progressão.
 */
export const CARGO_ICONES: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'graduation-cap', label: 'Formatura', Icon: GraduationCap },
  { key: 'book-open', label: 'Livro aberto', Icon: BookOpen },
  { key: 'book-marked', label: 'Livro marcado', Icon: BookMarked },
  { key: 'briefcase', label: 'Maleta', Icon: Briefcase },
  { key: 'scale', label: 'Balança', Icon: Scale },
  { key: 'gavel', label: 'Martelo', Icon: Gavel },
  { key: 'shield', label: 'Escudo', Icon: Shield },
  { key: 'landmark', label: 'Tribunal', Icon: Landmark },
  { key: 'crown', label: 'Coroa', Icon: Crown },
  { key: 'trophy', label: 'Troféu', Icon: Trophy },
  { key: 'medal', label: 'Medalha', Icon: Medal },
  { key: 'award', label: 'Prêmio', Icon: Award },
  { key: 'star', label: 'Estrela', Icon: Star },
  { key: 'swords', label: 'Espadas', Icon: Swords },
  { key: 'target', label: 'Alvo', Icon: Target },
  { key: 'rocket', label: 'Foguete', Icon: Rocket },
  { key: 'brain', label: 'Cérebro', Icon: Brain },
  { key: 'badge-check', label: 'Selo', Icon: BadgeCheck },
  { key: 'flame', label: 'Chama', Icon: Flame },
  { key: 'zap', label: 'Raio', Icon: Zap },
  // variações "bem diferentes"
  { key: 'coffee', label: 'Café', Icon: Coffee },
  { key: 'heart', label: 'Coração', Icon: Heart },
  { key: 'gem', label: 'Joia', Icon: Gem },
  { key: 'diamond', label: 'Diamante', Icon: Diamond },
  { key: 'anchor', label: 'Âncora', Icon: Anchor },
  { key: 'feather', label: 'Pena', Icon: Feather },
  { key: 'compass', label: 'Bússola', Icon: Compass },
  { key: 'globe', label: 'Globo', Icon: Globe },
  { key: 'lightbulb', label: 'Ideia', Icon: Lightbulb },
  { key: 'key', label: 'Chave', Icon: Key },
  { key: 'sword', label: 'Espada', Icon: Sword },
  { key: 'castle', label: 'Castelo', Icon: Castle },
  { key: 'leaf', label: 'Folha', Icon: Leaf },
  { key: 'sprout', label: 'Broto', Icon: Sprout },
  { key: 'mountain', label: 'Montanha', Icon: Mountain },
  { key: 'sun', label: 'Sol', Icon: Sun },
  { key: 'moon', label: 'Lua', Icon: Moon },
  { key: 'snowflake', label: 'Floco de neve', Icon: Snowflake },
  { key: 'umbrella', label: 'Guarda-chuva', Icon: Umbrella },
  { key: 'guitar', label: 'Guitarra', Icon: Guitar },
  { key: 'music', label: 'Música', Icon: Music },
  { key: 'camera', label: 'Câmera', Icon: Camera },
  { key: 'palette', label: 'Paleta', Icon: Palette },
  { key: 'wand', label: 'Varinha', Icon: Wand2 },
  { key: 'ghost', label: 'Fantasma', Icon: Ghost },
  { key: 'cat', label: 'Gato', Icon: Cat },
  { key: 'dog', label: 'Cachorro', Icon: Dog },
  { key: 'bird', label: 'Pássaro', Icon: Bird },
  { key: 'rabbit', label: 'Coelho', Icon: Rabbit },
  { key: 'paw', label: 'Pata', Icon: PawPrint },
  { key: 'dumbbell', label: 'Halteres', Icon: Dumbbell },
  { key: 'hammer', label: 'Martelo (obra)', Icon: Hammer },
  { key: 'wrench', label: 'Chave inglesa', Icon: Wrench },
  { key: 'atom', label: 'Átomo', Icon: Atom },
  { key: 'flask', label: 'Frasco', Icon: FlaskConical },
  { key: 'bike', label: 'Bike', Icon: Bike },
  { key: 'sailboat', label: 'Veleiro', Icon: Sailboat },
  { key: 'pizza', label: 'Pizza', Icon: Pizza },
  { key: 'cake', label: 'Bolo', Icon: Cake },
]

const MAPA = new Map(CARGO_ICONES.map((c) => [c.key, c.Icon]))
/** Ícone default quando o cargo não tem `icone` definido (ou a chave é desconhecida). */
export const CARGO_ICONE_PADRAO: LucideIcon = Briefcase

/** Resolve a chave do ícone para o componente lucide (tolerante: cai no default). */
export function iconeCargo(key?: string | null): LucideIcon {
  return (key ? MAPA.get(key) : undefined) ?? CARGO_ICONE_PADRAO
}
