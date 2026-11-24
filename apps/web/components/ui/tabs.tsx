"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

// Padrão ÚNICO de abas (igual a components/ui/abas-linha.tsx): texto simples, uma só linha de base (border-b)
// e o ativo sublinhado pelo PRÓPRIO trigger (border-b-2) — sem indicador deslizante (evita linha dupla).
const tabsListVariants = cva(
  "group/tabs-list flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  {
    variants: {
      variant: {
        default: "",
        line: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // cor do ativo (texto + border-color) via [data-slot="tabs-trigger"][data-active] no globals.css → controles de aba do console
        "-mb-px inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent pb-2.5 pt-1 text-[14px] font-semibold tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        "data-active:border-primary data-active:font-extrabold data-active:text-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none",
        "data-active:animate-in data-active:fade-in-0 data-active:slide-in-from-bottom-1 data-active:duration-200 motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
