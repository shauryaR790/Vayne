/** Fixed vertical fades at the main column edges (sidebar seam + viewport right). */
export function PageEdgeVignette() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 z-[35] w-8 bg-gradient-to-r from-black via-black/60 to-transparent sm:w-10 lg:left-[240px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 right-0 z-[35] w-8 bg-gradient-to-l from-black via-black/60 to-transparent sm:w-10"
      />
    </>
  );
}
