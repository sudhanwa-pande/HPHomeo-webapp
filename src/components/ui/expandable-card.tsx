"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

interface ExpandableCardProps {
  title: string
  src?: string
  description: string
  fallback?: string
  children?: React.ReactNode
  className?: string
  classNameExpanded?: string
  [key: string]: any
}

function ImageOrFallback({
  src,
  alt,
  fallback,
  className,
}: {
  src?: string
  alt: string
  fallback?: string
  className?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("object-cover object-center", className)}
      />
    )
  }

  const initials =
    fallback ||
    alt
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase()

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-[var(--brand)] via-blue-500 to-indigo-600 text-white",
        className
      )}
    >
      <span className="text-4xl font-bold opacity-90 sm:text-5xl">
        {initials}
      </span>
    </div>
  )
}

export function ExpandableCard({
  title,
  src,
  description,
  fallback,
  children,
  className,
  classNameExpanded,
  ...props
}: ExpandableCardProps) {
  const [active, setActive] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const id = React.useId()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive(false)
      }
    }

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        cardRef.current &&
        !cardRef.current.contains(event.target as Node)
      ) {
        setActive(false)
      }
    }

    if (active) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
      document.body.style.overflow = ""
    }
  }, [active])

  return (
    <>
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10 h-full w-full bg-white/50 backdrop-blur-md dark:bg-black/50"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && (
          <div
            className={cn(
              "fixed inset-0 z-[100] grid place-items-center before:pointer-events-none sm:mt-16"
            )}
          >
            <motion.div
              layoutId={`card-${title}-${id}`}
              ref={cardRef}
              className={cn(
                "relative flex h-full w-full max-w-[850px] flex-col overflow-auto bg-white shadow-sm [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] sm:rounded-t-3xl",
                classNameExpanded
              )}
              {...props}
            >
              <motion.div layoutId={`image-${title}-${id}`}>
                <div className="relative before:absolute before:inset-x-0 before:bottom-[-1px] before:z-50 before:h-[70px] before:bg-gradient-to-t before:from-white">
                  <ImageOrFallback
                    src={src}
                    alt={title}
                    fallback={fallback}
                    className="h-80 w-full"
                  />
                </div>
              </motion.div>
              <div className="relative h-full before:fixed before:inset-x-0 before:bottom-0 before:z-50 before:h-[70px] before:bg-gradient-to-t before:from-white">
                <div className="flex h-auto items-start justify-between p-6 sm:p-8">
                  <div>
                    <motion.p
                      layoutId={`description-${description}-${id}`}
                      className="text-base text-gray-500 sm:text-lg"
                    >
                      {description}
                    </motion.p>
                    <motion.h3
                      layoutId={`title-${title}-${id}`}
                      className="mt-0.5 text-2xl font-semibold text-gray-900 sm:text-4xl"
                    >
                      {title}
                    </motion.h3>
                  </div>
                  <motion.button
                    aria-label="Close card"
                    layoutId={`button-${title}-${id}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/90 bg-white text-gray-700 transition-colors duration-300 hover:border-gray-300/90 hover:bg-gray-50 hover:text-gray-900 focus:outline-none"
                    onClick={() => setActive(false)}
                  >
                    <motion.div
                      animate={{ rotate: active ? 45 : 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                    </motion.div>
                  </motion.button>
                </div>
                <div className="relative px-6 sm:px-8">
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-start gap-5 overflow-auto pb-10 text-base text-gray-500"
                  >
                    {children}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <motion.div
        role="dialog"
        aria-labelledby={`card-title-${id}`}
        aria-modal="true"
        layoutId={`card-${title}-${id}`}
        onClick={() => setActive(true)}
        className={cn(
          "flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm transition-shadow hover:shadow-md",
          className
        )}
      >
        <motion.div layoutId={`image-${title}-${id}`}>
          <ImageOrFallback
            src={src}
            alt={title}
            fallback={fallback}
            className="h-48 w-full sm:h-56"
          />
        </motion.div>
        <div className="flex items-center justify-between p-3.5">
          <div className="flex min-w-0 flex-col">
            <motion.p
              layoutId={`description-${description}-${id}`}
              className="text-xs font-medium text-gray-500"
            >
              {description}
            </motion.p>
            <motion.h3
              layoutId={`title-${title}-${id}`}
              className="truncate text-sm font-semibold text-gray-900 sm:text-base"
            >
              {title}
            </motion.h3>
          </div>
          <motion.button
            aria-label="Open card"
            layoutId={`button-${title}-${id}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/90 bg-white text-gray-700 transition-colors duration-300 hover:border-gray-300/90 hover:bg-gray-50 hover:text-gray-900 focus:outline-none"
          >
            <motion.div
              animate={{ rotate: active ? 45 : 0 }}
              transition={{ duration: 0.4 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </motion.div>
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
