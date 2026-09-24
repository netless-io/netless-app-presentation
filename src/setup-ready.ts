export type SetupImageResult = "loaded" | "error" | "timeout" | "disposed";

/** New lazy hosts await actual readiness; legacy hosts retain the bounded wait. */
export const waitForCurrentPageImage = (
  getImage: () => HTMLImageElement | null,
  timeoutMs: number,
  isDisposed: () => boolean,
  options?: { waitForReady: () => boolean; onTimeout: () => void },
): Promise<SetupImageResult> => {
  return new Promise(resolve => {
    let settled = false;
    let timedOut = false;
    let pollTimer: number | undefined;
    const settle = (result: SetupImageResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      resolve(result);
    };
    const timeoutTimer = window.setTimeout(() => {
      timedOut = true;
      options?.onTimeout();
      if (!options?.waitForReady()) settle("timeout");
    }, timeoutMs);
    const check = () => {
      if (isDisposed()) {
        settle("disposed");
        return;
      }
      if (timedOut && !options?.waitForReady()) { settle("timeout"); return; }
      const img = getImage();
      if (img?.complete) {
        if (img.naturalWidth > 0) {
          settle("loaded");
        } else if (img.currentSrc || img.getAttribute("src")?.trim() || img.getAttribute("srcset")?.trim()) {
          // complete is also true before src is assigned. Only an actual
          // image request with zero decoded width represents a failed load.
          settle("error");
        }
      }
    };
    check();
    if (!settled) pollTimer = window.setInterval(check, 100);
  });
};
