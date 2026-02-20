"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-2 font-bold uppercase tracking-wider text-base outline-none transition-all duration-150 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-64 sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:translate-x-0 active:translate-y-0 active:shadow-none",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-4 sm:h-8",
        icon: "size-9 sm:size-8",
        "icon-lg": "size-10 sm:size-9",
        "icon-sm": "size-8 sm:size-7",
        "icon-xl":
          "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs":
          "size-7 sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-6 sm:h-9",
        sm: "h-8 gap-1.5 px-3 sm:h-7",
        xl: "h-11 px-6 text-lg sm:h-10 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 px-2 text-sm sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "border-foreground bg-primary text-primary-foreground hover:shadow-[4px_4px_0_var(--color-foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5",
        destructive:
          "border-foreground bg-destructive text-white hover:shadow-[4px_4px_0_var(--color-foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5",
        "destructive-outline":
          "border-foreground/30 bg-transparent text-destructive hover:border-foreground hover:shadow-[4px_4px_0_var(--color-foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5",
        ghost:
          "border-transparent text-foreground [:hover,[data-pressed]]:bg-accent [:hover,[data-pressed]]:border-transparent",
        link: "border-transparent underline-offset-4 [:hover,[data-pressed]]:underline",
        outline:
          "border-foreground/30 bg-background text-foreground hover:border-foreground hover:shadow-[4px_4px_0_var(--color-foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5",
        secondary:
          "border-foreground/20 bg-secondary text-secondary-foreground hover:border-foreground hover:shadow-[4px_4px_0_var(--color-foreground)] hover:-translate-x-0.5 hover:-translate-y-0.5",
      },
    },
  },
);

interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export { Button, buttonVariants };
