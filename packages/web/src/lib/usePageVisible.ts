import { useSyncExternalStore } from "react";

/**
 * Whether this tab is visible right now (#958 part 3).
 *
 * Only an explicit `"hidden"` counts as hidden: `visibilityState` has had other
 * values over the years (`prerender`, `unloaded`) and a page that has never been
 * told it is hidden should behave as it always has. It also keeps every existing
 * jsdom test — which never sets the property — on today's "visible" behaviour.
 */
export function isPageHidden(doc: Document = document): boolean {
  return doc.visibilityState === "hidden";
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const getSnapshot = () => !isPageHidden();
const getServerSnapshot = () => true;

/** Re-renders on `visibilitychange`; true unless the tab is hidden. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
