"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap border-2 font-bold uppercase tracking-wider outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [button,a&]:cursor-pointer [button,a&]:pointer-coarse:after:absolute [button,a&]:pointer-coarse:after:size-full [button,a&]:pointer-coarse:after:min-h-11 [button,a&]:pointer-coarse:after:min-w-11",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "h-5.5 min-w-5.5 px-[calc(--spacing(1)-1px)] text-sm sm:h-4.5 sm:min-w-4.5 sm:text-xs",
        lg: "h-6.5 min-w-6.5 px-[calc(--spacing(1.5)-1px)] text-base sm:h-5.5 sm:min-w-5.5 sm:text-sm",
        sm: "h-5 min-w-5 rounded-[calc(var(--radius-sm)-2px)] px-[calc(--spacing(1)-1px)] text-xs sm:h-4 sm:min-w-4 sm:text-[.625rem]",
      },
      variant: {
        default:
          "border-foreground bg-primary text-primary-foreground [button,a&]:hover:bg-primary/90",
        destructive:
          "border-foreground bg-destructive text-white [button,a&]:hover:bg-destructive/90",
        secondary:
          "border-foreground bg-secondary text-secondary-foreground [button,a&]:hover:bg-secondary/90",
        outline:
          "border-foreground/30 bg-background text-foreground [button,a&]:hover:bg-muted",
        /* Status-style: tinted fill + strong-colored text/border. Mirrors design bundle chips. */
        active:
          "border-success/40 bg-success/10 text-success",
        new: "border-primary/40 bg-primary/10 text-primary",
        churned:
          "border-destructive/40 bg-destructive/10 text-destructive",
        draft:
          "border-foreground/20 bg-muted text-muted-foreground",
        pending:
          "border-foreground/20 bg-background text-muted-foreground",
        auto: "border-primary/40 bg-primary/10 text-primary",
        custom:
          "border-foreground/20 bg-background text-muted-foreground",
        running:
          "border-primary/40 bg-primary/10 text-primary",
        completed:
          "border-success/40 bg-success/10 text-success",
        failed:
          "border-destructive/40 bg-destructive/10 text-destructive",
        /* Legacy semantic tints (kept for existing callers). */
        error:
          "border-destructive/40 bg-destructive/10 text-destructive",
        info: "border-primary/40 bg-primary/10 text-primary",
        success: "border-success/40 bg-success/10 text-success",
        warning: "border-warning/40 bg-warning/10 text-warning-foreground",
      },
    },
  },
);

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  size?: VariantProps<typeof badgeVariants>["size"];
}

function Badge({ className, variant, size, render, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

export { Badge, badgeVariants };
