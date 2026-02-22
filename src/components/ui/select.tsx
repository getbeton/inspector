"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// ─── Root ──────────────────────────────────────────────────────────

const SelectRoot = SelectPrimitive.Root;

// ─── Trigger ───────────────────────────────────────────────────────

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props & React.RefAttributes<HTMLButtonElement>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "inline-flex h-8.5 w-full items-center justify-between border-2 border-foreground/20 bg-background px-[calc(--spacing(3)-1px)] text-base text-foreground transition-all focus-visible:border-foreground focus-visible:shadow-[2px_2px_0_var(--color-foreground)] focus-visible:outline-none disabled:opacity-64 sm:h-7.5 sm:text-sm",
        className,
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

// ─── Value ─────────────────────────────────────────────────────────

const SelectValue = SelectPrimitive.Value;

// ─── Popup (portal + positioner + popup + list) ────────────────────

function SelectPopup({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={4}>
        <SelectPrimitive.Popup
          className={cn(
            "z-50 max-h-64 min-w-[var(--anchor-width)] overflow-auto border-2 border-foreground/20 bg-background py-1 shadow-md",
            className,
          )}
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

// ─── Item ──────────────────────────────────────────────────────────

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 px-3 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="inline-flex size-4 shrink-0 items-center justify-center">
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

// ─── Exports ───────────────────────────────────────────────────────

export {
  SelectRoot as Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
};
