"use client";

import { Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface StepData {
  label: string;
  summary?: string;
}

interface BookingStepperProps {
  steps: StepData[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export function BookingStepper({
  steps,
  currentStep,
  onStepClick,
  className,
}: BookingStepperProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <HorizontalStepper steps={steps} currentStep={currentStep} />;
  }

  return (
    <VerticalStepper
      steps={steps}
      currentStep={currentStep}
      onStepClick={onStepClick}
      className={className}
    />
  );
}

function HorizontalStepper({
  steps,
  currentStep,
}: {
  steps: StepData[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        return (
          <div key={step.label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                isDone
                  ? "bg-gradient-to-br from-brand to-blue-600 text-white shadow-lg shadow-brand/20"
                  : isActive
                    ? "bg-gradient-to-br from-brand to-blue-600 text-white shadow-lg shadow-brand/20 ring-4 ring-brand/10"
                    : "border border-gray-200/60 bg-white text-gray-500",
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden text-xs font-medium sm:block",
                isActive ? "text-gray-900" : "text-gray-500",
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 transition-colors",
                  isDone ? "bg-brand" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function VerticalStepper({
  steps,
  currentStep,
  onStepClick,
  className,
}: {
  steps: StepData[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        const isClickable = isDone && onStepClick;

        return (
          <button
            key={step.label}
            onClick={() => isClickable && onStepClick(i)}
            disabled={!isClickable}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-all",
              isClickable && "hover:bg-gray-50 cursor-pointer",
              isActive && "bg-brand/5",
            )}
          >
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                  isDone
                    ? "bg-gradient-to-br from-brand to-blue-600 text-white"
                    : isActive
                      ? "bg-gradient-to-br from-brand to-blue-600 text-white ring-4 ring-brand/10"
                      : "border border-gray-200 bg-white text-gray-400",
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "my-1 h-6 w-0.5 rounded-full",
                    isDone ? "bg-brand/40" : "bg-gray-200",
                  )}
                />
              )}
            </div>

            {/* Step content */}
            <div className="min-w-0 pt-0.5">
              <p
                className={cn(
                  "text-xs font-semibold",
                  isActive ? "text-brand" : isDone ? "text-gray-900" : "text-gray-400",
                )}
              >
                {step.label}
              </p>
              {isDone && step.summary && (
                <p className="mt-0.5 truncate text-[11px] text-gray-500">
                  {step.summary}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
