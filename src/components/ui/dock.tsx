"use client";

import * as React from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface DockProps {
  className?: string;
  children: React.ReactNode;
  maxAdditionalSize?: number;
  iconSize?: number;
}

interface DockIconProps {
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  label: string;
  isActive?: boolean;
  handleIconHover?: (e: React.MouseEvent<HTMLLIElement>) => void;
  iconSize?: number;
  badge?: number;
  activeClassName?: string;
  colorClassName?: string;
}

type ScaleValueParams = [number, number];

function scaleValue(
  value: number,
  from: ScaleValueParams,
  to: ScaleValueParams,
): number {
  const scale = (to[1] - to[0]) / (from[1] - from[0]);
  const capped = Math.min(from[1], Math.max(from[0], value)) - from[0];
  return Math.floor(capped * scale + to[0]);
}

export function DockIcon({
  className,
  children,
  onClick,
  label,
  isActive,
  handleIconHover,
  iconSize,
  badge,
  activeClassName,
  colorClassName,
}: DockIconProps) {
  const ref = useRef<HTMLLIElement | null>(null);

  return (
    <li
      ref={ref}
      style={
        {
          "--icon-size": `${iconSize}px`,
          transition:
            "width 150ms cubic-bezier(0.25, 1, 0.5, 1), height 150ms cubic-bezier(0.25, 1, 0.5, 1), margin-top 150ms cubic-bezier(0.25, 1, 0.5, 1)",
        } as React.CSSProperties
      }
      onMouseMove={handleIconHover}
      className={cn(
        "dock-icon group/li relative flex h-[var(--icon-size)] w-[var(--icon-size)] cursor-pointer items-center justify-center",
        className,
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "group/btn relative flex aspect-square w-full items-center justify-center rounded-[12px] border transition-all duration-200",
          isActive
            ? cn("border-white/40 shadow-lg", activeClassName || "bg-gradient-to-t from-brand/15 to-brand/5 shadow-brand/20", colorClassName || "text-brand")
            : cn("border-white/60 bg-gradient-to-t from-white/80 to-white/95 shadow-sm hover:border-white/40 hover:shadow-md", colorClassName || "text-brand-subtext"),
        )}
      >
        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-lg border border-white/60 bg-white/90 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-brand-dark opacity-0 shadow-lg backdrop-blur-xl transition-all duration-200 group-hover/li:opacity-100 group-hover/li:-bottom-10">
          {label}
        </span>
        {children}
        {isActive && (
          <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" />
        )}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>
    </li>
  );
}

export function Dock({
  className,
  children,
  maxAdditionalSize = 5,
  iconSize = 48,
}: DockProps) {
  const dockRef = useRef<HTMLDivElement | null>(null);

  const handleIconHover = (e: React.MouseEvent<HTMLLIElement>) => {
    if (!dockRef.current) return;
    const mousePos = e.clientX;
    const iconPosLeft = e.currentTarget.getBoundingClientRect().left;
    const iconWidth = e.currentTarget.getBoundingClientRect().width;

    const cursorDistance = (mousePos - iconPosLeft) / iconWidth;
    const offsetPixels = scaleValue(
      cursorDistance,
      [0, 1],
      [maxAdditionalSize * -1, maxAdditionalSize],
    );

    dockRef.current.style.setProperty(
      "--dock-offset-left",
      `${offsetPixels * -1}px`,
    );
    dockRef.current.style.setProperty(
      "--dock-offset-right",
      `${offsetPixels}px`,
    );
  };

  return (
    <nav ref={dockRef} role="navigation" aria-label="Main navigation">
      <ul
        className={cn(
          "flex items-start gap-1 rounded-2xl border border-white/50 bg-white/70 p-1.5 shadow-xl shadow-black/5 backdrop-blur-2xl",
          className,
        )}
      >
        {React.Children.map(children, (child) =>
          React.isValidElement<DockIconProps>(child)
            ? React.cloneElement(child as React.ReactElement<DockIconProps>, {
                handleIconHover,
                iconSize,
              })
            : child,
        )}
      </ul>
    </nav>
  );
}
