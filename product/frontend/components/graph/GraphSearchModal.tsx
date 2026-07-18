"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import type { GraphNode } from "@/lib/types";
import { nodeMatchesSearch } from "./graphUtils";

export function GraphSearchModal({
  open,
  nodes,
  onClose,
  onSelect,
}: {
  open: boolean;
  nodes: GraphNode[];
  onClose: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const matches = useMemo(() => {
    if (!query.trim()) return nodes.slice(0, 8);
    return nodes.filter((n) => nodeMatchesSearch(n, query)).slice(0, 8);
  }, [nodes, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[18vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#09090b] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to host, service, CVE…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && matches[0]) {
                onSelect(matches[0].id);
                onClose();
              }
            }}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/40 hover:text-white/70"
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {matches.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-white/[0.04]"
                onClick={() => {
                  onSelect(node.id);
                  onClose();
                }}
              >
                <span className="text-[13px] font-medium text-white/90">{node.label}</span>
                <span className="text-[11px] text-white/35">{node.type}</span>
              </button>
            </li>
          ))}
          {!matches.length ? (
            <li className="px-3 py-6 text-center text-[12px] text-white/35">No matching nodes</li>
          ) : null}
        </ul>
        <div className="border-t border-white/8 px-3 py-2 text-[10px] text-white/30">
          Enter to jump · Esc to close · Press / anytime
        </div>
      </div>
    </div>
  );
}
