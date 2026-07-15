"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import type { CommandPaletteItem } from "@/lib/investigation-home";
import { cn } from "@/lib/utils";

export function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: CommandPaletteItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.label, item.hint, item.shortcut, ...(item.keywords ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].action();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, filtered, onClose, open]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, CommandPaletteItem[]>>((acc, item) => {
    const key = item.kind;
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupLabels: Record<string, string> = {
    command: "Commands",
    investigation: "Investigations",
    action: "Actions",
    search: "Search",
  };

  let rowIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[560px] border border-white/20 bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search className="size-4 shrink-0 text-white/40" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investigations, commands, evidence…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
          />
          <kbd className="border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/40">
            Esc
          </kbd>
        </div>

        <div className="max-h-[min(420px,50vh)] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-white/40">No matches</p>
          ) : (
            Object.entries(grouped).map(([kind, rows]) => (
              <div key={kind} className="py-1">
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
                  {groupLabels[kind] ?? kind}
                </p>
                {rows.map((item) => {
                  rowIndex += 1;
                  const idx = rowIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        item.action();
                        onClose();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150",
                        idx === activeIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">
                        {item.label}
                      </span>
                      {item.hint ? (
                        <span className="truncate text-[11px] text-white/35">{item.hint}</span>
                      ) : null}
                      {item.shortcut ? (
                        <kbd className="shrink-0 border border-white/12 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
                          {item.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
