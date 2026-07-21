"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Plus, Upload } from "lucide-react";

import { HoverCard } from "@/components/shared/hover-card";
import { VayneThinking } from "@/components/shared/vayne-thinking";

const EXAMPLES = [
  "Analyze this Nmap scan",
  "Explain these CVEs",
  "Generate an executive report",
  "Find attack paths",
  "Explain why findings were rejected",
];

interface VayneHomeProps {
  files: File[];
  question: string;
  analyzing: boolean;
  backendOnline: boolean;
  status: string;
  onFilesSelected: (files: FileList | null) => void;
  onQuestionChange: (value: string) => void;
  onUpload: () => void;
  onAsk: () => void;
  onExample: (text: string) => void;
}

export function VayneHome({
  files,
  question,
  analyzing,
  backendOnline,
  status,
  onFilesSelected,
  onQuestionChange,
  onUpload,
  onAsk,
  onExample,
}: VayneHomeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        pageRef.current!.querySelectorAll(".vx-enter"),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out", delay: 0.1 },
      );
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const canSubmit = (files.length > 0 || question.trim()) && backendOnline && !analyzing;

  return (
    <div
      ref={pageRef}
      className="flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center px-5 py-12 lg:px-8"
    >
      <div className="vx-enter w-full max-w-[720px] text-center">
        <h1 className="text-4xl font-black tracking-tight text-white lg:text-5xl">VAYNE</h1>
        <p className="mt-4 text-[15px] text-white/50">What should we investigate?</p>
      </div>

      <div className="vx-enter mt-10 w-full max-w-[720px]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />

        <HoverCard className="w-full" lift={false}>
          <div className="flex items-center gap-2 border-b border-white/15 px-4 py-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/55 transition-colors hover:text-white disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              Upload evidence
            </button>
            {files.length > 0 ? (
              <span className="truncate text-[11px] text-white/40">
                {files.map((f) => f.name).join(", ")}
              </span>
            ) : null}
          </div>
          <textarea
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            disabled={analyzing}
            placeholder="Ask VAYNE about infrastructure, scans, CVEs, attack paths…"
            rows={3}
            className="w-full resize-none bg-black px-4 py-4 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/30 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSubmit) {
                e.preventDefault();
                files.length ? onUpload() : onAsk();
              }
            }}
          />
        </HoverCard>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="inline-flex items-center gap-2 border border-white/30 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white hover:text-white disabled:opacity-40"
          >
            <Upload className="size-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={!files.length || analyzing || !backendOnline}
            className="border border-white bg-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white disabled:opacity-40"
          >
            Analyze Scan
          </button>
          <button
            type="button"
            onClick={onAsk}
            disabled={!question.trim() || analyzing || !backendOnline}
            className="border border-white/30 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white hover:text-white disabled:opacity-40"
          >
            Ask Question
          </button>
        </div>

        {analyzing ? (
          <div className="mt-8 flex justify-center">
            <VayneThinking label="VAYNE is reasoning about your environment" />
          </div>
        ) : null}

        {status && !analyzing ? (
          <p className="mt-4 text-center text-[11px] font-bold uppercase tracking-wider text-white/45">
            {status}
          </p>
        ) : null}

        {!backendOnline && !analyzing ? (
          <p className="mt-2 text-center text-[11px] text-white/35">
            Backend offline — start the VAYNE API on port 8000
          </p>
        ) : null}
      </div>

      <div className="vx-enter mt-12 w-full max-w-[720px]">
        <p className="text-center text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
          Examples
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={analyzing}
              onClick={() => onExample(ex)}
              className="border border-white/15 px-3 py-2 text-[11px] text-white/50 transition-colors hover:border-white/35 hover:text-white/75 disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
