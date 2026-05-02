"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-background p-3", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 sm:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 z-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-8 p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-8 p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "text-sm font-semibold text-brand-dark select-none",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 rounded-md text-[0.8rem] font-normal text-brand-subtext/60 select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn(
          "relative aspect-square h-9 w-9 p-0 text-center text-sm select-none",
          defaultClassNames.day
        ),
        day_button: cn(
          "h-9 w-9 rounded-lg font-medium text-brand-dark transition-colors hover:bg-brand-bg aria-selected:bg-brand aria-selected:text-white aria-selected:font-semibold",
          defaultClassNames.day_button
        ),
        today: cn(
          "rounded-lg bg-brand/10 text-brand",
          defaultClassNames.today
        ),
        outside: cn(
          "text-brand-subtext/30 aria-selected:text-brand-subtext/40",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-brand-subtext/25 opacity-50",
          defaultClassNames.disabled
        ),
        range_middle: cn(
          "rounded-none bg-brand/10 aria-selected:bg-brand/10 aria-selected:text-brand-dark",
          defaultClassNames.range_middle
        ),
        range_start: cn(
          "rounded-l-lg bg-brand aria-selected:bg-brand aria-selected:text-white",
          defaultClassNames.range_start
        ),
        range_end: cn(
          "rounded-r-lg bg-brand aria-selected:bg-brand aria-selected:text-white",
          defaultClassNames.range_end
        ),
        selected: cn(
          "bg-brand text-white hover:bg-brand/90",
          defaultClassNames.selected
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", iconClassName)} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", iconClassName)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
