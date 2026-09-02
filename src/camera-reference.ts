import type { Camera, Rectangle, Size } from "@netless/window-manager"

export function isValidSize(size: Size | null | undefined): size is Size {
  return Boolean(
    size &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  )
}

export function getCameraReferenceSize(
  originSize: Size | null | undefined,
  pageSize: Size
): Size {
  return isValidSize(originSize) ? originSize : pageSize
}

export function getFitScale(viewSize: Size, referenceSize: Size): number | undefined {
  if (!isValidSize(viewSize) || !isValidSize(referenceSize)) return
  const scale = Math.min(
    viewSize.width / referenceSize.width,
    viewSize.height / referenceSize.height
  )
  return Number.isFinite(scale) && scale > 0 ? scale : undefined
}

export function cameraToSharedViewport(
  camera: Camera,
  viewSize: Size,
  referenceSize: Size
): Rectangle | undefined {
  const fitScale = getFitScale(viewSize, referenceSize)
  if (
    fitScale === undefined ||
    !Number.isFinite(camera.centerX) ||
    !Number.isFinite(camera.centerY) ||
    !Number.isFinite(camera.scale) ||
    camera.scale <= 0
  ) {
    return
  }

  const normalizedScale = camera.scale / fitScale
  const width = referenceSize.width / normalizedScale
  const height = referenceSize.height / normalizedScale
  return {
    originX: camera.centerX - width / 2,
    originY: camera.centerY - height / 2,
    width,
    height,
  }
}
