export interface CameraTransformOptions {
  disableCameraTransform?: boolean;
  disableDeviceCameraTransform?: boolean;
}

export function getCameraScaleRange(
  fitScale: number,
  maxCameraScale: number,
  disableCameraTransform?: boolean
): { minScale: number; maxScale: number } {
  return {
    minScale: fitScale,
    maxScale: fitScale * (disableCameraTransform ? 1 : maxCameraScale),
  }
}

export function shouldDisableDeviceCameraTransform(options: CameraTransformOptions): boolean {
  return Boolean(options.disableCameraTransform || options.disableDeviceCameraTransform)
}
