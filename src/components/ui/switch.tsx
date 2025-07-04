import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, onCheckedChange, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
        "data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400 dark:data-[state=unchecked]:bg-gray-600 dark:data-[state=unchecked]:border-gray-500",
        // Fallback classes baseadas no prop checked
        checked ? "bg-primary border-primary" : "bg-gray-300 border-gray-400 dark:bg-gray-600 dark:border-gray-500",
        className
      )}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
          // Fallback classes baseadas no prop checked
          checked ? "translate-x-5" : "translate-x-0",
          "dark:bg-white"
        )}
              />
      </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
