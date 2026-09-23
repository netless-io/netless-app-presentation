export interface PresentationRuntimeBox {
  unmountContent?(): unknown;
  unmountFooter?(): unknown;
  unmountStyles?(): unknown;
}

/** Build an idempotent runtime teardown while preserving the TeleBox shell. */
export const createPresentationRuntimeTeardown = (
  box: PresentationRuntimeBox,
  dispose: () => void,
): (() => void) => {
  let tornDown = false;
  return () => {
    if (tornDown) return;
    tornDown = true;
    try {
      dispose();
    } finally {
      // A partial host API or a failing mount must not skip other cleanup.
      try {
        box.unmountContent?.();
      } finally {
        try {
          box.unmountFooter?.();
        } finally {
          box.unmountStyles?.();
        }
      }
    }
  };
};
