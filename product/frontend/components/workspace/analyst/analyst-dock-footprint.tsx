"use client";

/**
 * Invisible clone of the Ask VAYNE dock (quota + composer) so Engine Trace
 * empty copy centers at the same vertical height as the analyst panel.
 */
export function AnalystDockFootprint() {
  return (
    <div className="invisible pointer-events-none shrink-0 select-none space-y-2 p-3" aria-hidden>
      <p className="px-1 text-[11px] text-white/40">4 free Ask VAYNE messages left</p>
      <div className="w-full">
        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="min-h-[44px] w-full px-3.5 pb-1 pt-3 text-[14px] leading-relaxed">
            &nbsp;
          </div>
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-0.5">
            <div className="flex min-w-0 flex-1 items-center gap-0.5">
              <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[12px]">
                <span className="inline-block size-3.5" />
                <span>Analyst</span>
                <span className="inline-block size-3" />
              </div>
              <div className="inline-flex px-1.5 py-1 text-[12px]">
                <span>Analyst</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="size-7" />
              <span className="size-7" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
