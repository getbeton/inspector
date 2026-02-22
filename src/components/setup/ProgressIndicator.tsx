"use client";

import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

/**
 * Rich step descriptor for the progress indicator.
 * Carries metadata about optional/skipped status for visual differentiation.
 */
export interface StepInfo {
  key: string;
  label: string;
  optional?: boolean;
  status: "pending" | "completed" | "skipped";
}

export interface ProgressIndicatorProps {
  steps: StepInfo[];
  currentIndex: number;
  className?: string;
}

/**
 * Visual progress indicator for the setup wizard
 *
 * Shows a horizontal step indicator with:
 * - Completed steps: checkmark icon, filled circle
 * - Skipped steps: dash icon, muted circle
 * - Current step: highlighted, primary outline
 * - Upcoming steps: outline circle
 * - Optional steps: dashed border circle + "(Optional)" suffix
 */
export function ProgressIndicator({
  steps,
  currentIndex,
  className,
}: ProgressIndicatorProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      data-slot="progress-indicator"
      role="navigation"
      aria-label="Setup progress"
    >
      {steps.map((step, index) => {
        const isCompleted = step.status === "completed";
        const isSkipped = step.status === "skipped";
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex && !isCompleted && !isSkipped;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              {/* Circle with status */}
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
                  step.optional ? "border-2 border-dashed" : "border-2",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isSkipped && "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
                  isCurrent && "border-primary bg-primary/10 text-primary",
                  isUpcoming && "border-muted-foreground/30 bg-transparent text-muted-foreground/50"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : isSkipped ? (
                  <Minus className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  "mt-2 text-xs font-medium transition-colors duration-300",
                  isCompleted && "text-primary",
                  isSkipped && "text-muted-foreground/50",
                  isCurrent && "text-foreground",
                  isUpcoming && "text-muted-foreground/50"
                )}
              >
                {step.label}
                {step.optional && (
                  <span className="block text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                    Optional
                  </span>
                )}
              </span>
            </div>

            {/* Connector line (not after the last step) */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-0.5 w-8 lg:w-12 transition-colors duration-300",
                  index < currentIndex ? "bg-primary" : "bg-muted-foreground/20"
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ProgressIndicator;
