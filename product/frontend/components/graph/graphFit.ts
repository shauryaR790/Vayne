import { getNodesBounds, type Node, type ReactFlowInstance } from "@xyflow/react";

export const FIT_PADDING = 0.1;
export const FIT_DURATION = 500;
export const FIT_MAX_ZOOM = 1.15;
export const FIT_MIN_ZOOM = 0.2;

/**
 * Fit graph to viewport height with 10% padding.
 * Never compress below readable zoom — wide graphs pan horizontally instead.
 */
export function applyGraphFit(
  instance: ReactFlowInstance,
  flowNodes: Node[],
  container?: { width: number; height: number },
): void {
  const targets = flowNodes.filter((n) => !n.hidden);
  if (!targets.length) return;

  const bounds = getNodesBounds(targets);
  const viewport =
    container ??
    (() => {
      const el = document.querySelector(".vx-graph-canvas")?.getBoundingClientRect();
      return { width: el?.width ?? 960, height: el?.height ?? 560 };
    })();

  const padX = viewport.width * FIT_PADDING;
  const padY = viewport.height * FIT_PADDING;
  const innerH = viewport.height - padY * 2;
  const innerW = viewport.width - padX * 2;

  const zoomByHeight = innerH / Math.max(bounds.height, 1);
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, zoomByHeight));

  const contentW = bounds.width * zoom;
  const x =
    contentW > innerW
      ? padX - bounds.x * zoom
      : padX + (innerW - contentW) / 2 - bounds.x * zoom;
  const y = padY + (innerH - bounds.height * zoom) / 2 - bounds.y * zoom;

  instance.setViewport({ x, y, zoom }, { duration: FIT_DURATION });
}

export function centerOnNode(
  instance: ReactFlowInstance,
  node: Node,
  zoom = 1.05,
): void {
  const width = Number(node.width ?? 196);
  const height = Number(node.height ?? 88);
  instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
    zoom,
    duration: FIT_DURATION,
  });
}
