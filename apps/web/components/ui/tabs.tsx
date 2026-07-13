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

// Estilo padronizado (igual ao tab do Webhook): sublinhado com cor primária no ativo.
const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center text-muted-foreground",
  {
    variants: {
      variant: {
        default:
          "w-full gap-5 border-b group-data-vertical/tabs:w-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch group-data-vertical/tabs:gap-1 group-data-vertical/tabs:border-b-0 group-data-vertical/tabs:border-l",
        line: "w-full gap-5 border-b",
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
      className={cn("relative", tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      {/* Indicador que desliza suavemente entre os tabs (movimento). */}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className={cn(
          "pointer-events-none absolute rounded-full bg-primary transition-all duration-300 ease-out motion-reduce:transition-none",
          "group-data-horizontal/tabs:bottom-[-1px] group-data-horizontal/tabs:left-0 group-data-horizontal/tabs:h-0.5 group-data-horizontal/tabs:w-[var(--active-tab-width)] group-data-horizontal/tabs:translate-x-[var(--active-tab-left)]",
          "group-data-vertical/tabs:left-[-1px] group-data-vertical/tabs:top-0 group-data-vertical/tabs:w-0.5 group-data-vertical/tabs:h-[var(--active-tab-height)] group-data-vertical/tabs:translate-y-[var(--active-tab-top)]"
        )}
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent pb-2.5 pt-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-active:text-primary focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:-ml-px group-data-vertical/tabs:justify-start group-data-vertical/tabs:border-b-0 group-data-vertical/tabs:border-l-2 group-data-vertical/tabs:pb-0 group-data-vertical/tabs:pt-0 group-data-vertical/tabs:pl-3",
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
