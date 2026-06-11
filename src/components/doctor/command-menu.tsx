"use client";

import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CommandAction {
  id: string;
  label: string;
  category: string;
  shortcut?: string[];
  action: () => void;
  when?: () => boolean;
}

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandAction[];
}

// Debounce hook to prevent UI search jitter
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function CommandMenu({
  open,
  onOpenChange,
  commands,
}: CommandMenuProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 50);

  // Toggle open on Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const filteredCommands = commands.filter((cmd) => {
    if (cmd.when && !cmd.when()) return false;
    if (!debouncedSearch) return true;
    const term = debouncedSearch.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(term) ||
      cmd.category.toLowerCase().includes(term)
    );
  });

  // Group commands by category
  const groups = filteredCommands.reduce<Record<string, CommandAction[]>>(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[550px] overflow-hidden p-0 shadow-2xl border border-white/10 bg-[#111113]/95 backdrop-blur-md">
        <DialogTitle className="sr-only">Command Menu</DialogTitle>
        <Command className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-transparent">
          <div className="flex items-center border-b border-white/10 px-3 relative">
            <Search className="mr-2 h-4 w-4 shrink-0 text-white/40" />
            <Command.Input
              placeholder="Type a command or search..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm text-white placeholder-white/30 outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="pointer-events-none absolute right-4 top-3 hidden select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-white/40 sm:flex">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
            {filteredCommands.length === 0 && (
              <Command.Empty className="py-6 text-center text-sm text-white/40">
                No results found.
              </Command.Empty>
            )}

            {Object.entries(groups).map(([category, items]) => (
              <Command.Group
                key={category}
                heading={category}
                className="px-2 py-1.5 text-xs font-semibold text-brand tracking-wider uppercase"
              >
                {items.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    onSelect={() => {
                      cmd.action();
                      onOpenChange(false);
                      setSearch("");
                    }}
                    className="flex cursor-pointer select-none items-center justify-between rounded-md px-2.5 py-2 text-sm text-white/80 outline-none hover:bg-white/5 hover:text-white data-[selected='true']:bg-white/5 data-[selected='true']:text-white transition-colors duration-150"
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <div className="flex items-center gap-1">
                        {cmd.shortcut.map((key) => (
                          <kbd
                            key={key}
                            className="pointer-events-none select-none rounded bg-white/10 px-1 font-mono text-[10px] text-white/60 border border-white/5"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
