// Inclusive source coordinates, independent of pixels, gauge and C presentation.
export function selectionBounds(anchor, end) {
  return { left: Math.min(anchor.x, end.x), right: Math.max(anchor.x, end.x),
    top: Math.min(anchor.y, end.y), bottom: Math.max(anchor.y, end.y) };
}
export function includesCell(bounds, x, y) {
  return Boolean(bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
}
