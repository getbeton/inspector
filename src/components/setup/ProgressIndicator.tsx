"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface ProgressIndicatorProps {
  /**
   * Array of step labels to display
   * For self-hosted mode, omit the Billing step
   */
  steps: string[];
  /**
   * The current active step (must match a value in steps array)
   */
  current: string;
  /**
   * Optional CSS class for the container
   */
  className?: string;
}

/**
 * Visual progress indicator for the setup wizard
 *
 * Shows a horizontal step indicator with:
 * - Completed steps (checkmark icon, filled circle)
 * - Current step (highlighted, pulsing indicator)
 * - Upcoming steps (outline circle)
 *
 * Adapts to self-hosted mode by accepting a dynamic steps array
 * (Billing step is omitted for self-hosted deployments)
 */
export function ProgressIndicator({
  steps,
  current,
  className,
}: ProgressIndicatorProps) {
  const currentIndex = steps.indexOf(current);

  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      data-slot="progress-indicator"
      role="navigation"
      aria-label="Setup progress"
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;

        return (
          <div key={step} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              {/* Circle with status */}
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300",
                  isCompleted && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary bg-primary/10 text-primary",
                  isUpcoming && "border-muted-foreground/30 bg-transparent text-muted-foreground/50"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  "mt-2 text-xs font-medium transition-colors duration-300",
                  isCompleted && "text-primary",
                  isCurrent && "text-foreground",
                  isUpcoming && "text-muted-foreground/50"
                )}
              >
                {step}
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
