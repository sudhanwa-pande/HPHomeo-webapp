"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface HeroTypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  imageSrc?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageClassName?: string;
}

export function HeroTypewriter({
  text,
  speed = 85,
  delay = 220,
  imageSrc,
  imageAlt = "",
  imageWidth = 160,
  imageHeight = 100,
  imageClassName = "",
}: HeroTypewriterProps) {
  const prefersReducedMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = useState(0);
  const lines = text.split("\n");
  const totalCharacters = lines.reduce((count, line) => count + line.length, 0);

  useEffect(() => {
    if (prefersReducedMotion || visibleCount >= totalCharacters) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 1, totalCharacters));
    }, visibleCount === 0 ? delay : speed);

    return () => window.clearTimeout(timeout);
  }, [delay, prefersReducedMotion, speed, totalCharacters, visibleCount]);

  function getVisibleLineText(lineIndex: number) {
    const previousCharacters = lines
      .slice(0, lineIndex)
      .reduce((count, line) => count + line.length, 0);
    const remainingCharacters = Math.max(visibleCount - previousCharacters, 0);
    return lines[lineIndex].slice(0, remainingCharacters);
  }

  const trailingImage = (isVisible: boolean) =>
    imageSrc ? (
      <span
        className={`hero-line-icon transition-all duration-500 ${
          isVisible
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-2 opacity-0"
        }`}
      >
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={imageWidth}
          height={imageHeight}
          className={imageClassName}
        />
      </span>
    ) : null;

  if (prefersReducedMotion) {
    return (
      <span className="inline-flex flex-col items-start gap-y-[0.08em]">
        {lines.map((line, index) => (
          <span key={line} className="block">
            {index === lines.length - 1 ? (
              <span className="hero-line-pill">
                <span className="hero-line-measure" aria-hidden="true">
                  {line}
                </span>
                <span className="hero-line-text">{line}</span>
                {trailingImage(true)}
              </span>
            ) : (
              <span>{line}</span>
            )}
          </span>
        ))}
      </span>
    );
  }

  const isComplete = visibleCount >= totalCharacters;
  let activeLineIndex = lines.findIndex(
    (_, index) => getVisibleLineText(index).length < lines[index].length,
  );
  if (activeLineIndex === -1) {
    activeLineIndex = lines.length - 1;
  }

  return (
    <span
      aria-label={text.replace(/\n/g, " ")}
      className="inline-flex flex-col items-start gap-y-[0.08em]"
    >
      {lines.map((line, index) => {
        const visibleLineText = getVisibleLineText(index);
        const isLastLine = index === lines.length - 1;
        const showCaret = !isComplete && activeLineIndex === index;
        const showLastLinePill = isLastLine && (visibleLineText.length > 0 || isComplete);

        return (
          <span key={`${line}-${index}`} className="block">
            {isLastLine ? (
              showLastLinePill ? (
                <span className="hero-line-pill">
                  <span className="hero-line-measure" aria-hidden="true">
                    {line}
                  </span>
                  <span className="hero-line-text">
                    {visibleLineText}
                    {showCaret ? (
                      <span aria-hidden="true" className="typewriter-caret" />
                    ) : null}
                  </span>
                  {trailingImage(isComplete)}
                </span>
              ) : null
            ) : (
              <span className="inline-flex items-center gap-[0.14em]">
                <span>{visibleLineText}</span>
                {showCaret ? (
                  <span aria-hidden="true" className="typewriter-caret" />
                ) : null}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
