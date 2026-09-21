export interface PresentationRuntimeBox {
  unmountContent(): unknown;
  unmountFooter(): unknown;
  unmountStyles(): unknown;
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
      box.unmountContent();
      box.unmountFooter();
      box.unmountStyles();
    }
  };
};
