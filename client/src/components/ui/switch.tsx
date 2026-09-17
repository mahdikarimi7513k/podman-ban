
import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // larger track: h-6 w-11 (24×44px) — proper touch target
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent",
        "bg-input data-[state=checked]:bg-foreground",
        "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "cursor-pointer",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // thumb 18px
          "pointer-events-none block size-[18px] rounded-full bg-background shadow-sm",
          "ring-0",
          // smooth spring-like transition (not just transform)
          "transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          // LTR: thumb starts at left, slides right when checked
          "ltr:data-[state=unchecked]:translate-x-[3px]",
          "ltr:data-[state=checked]:translate-x-[calc(100%+3px)]",
          // RTL: thumb starts at right, slides left when checked
          "rtl:data-[state=unchecked]:translate-x-[-3px]",
          "rtl:data-[state=checked]:translate-x-[calc(-100%-3px)]",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
