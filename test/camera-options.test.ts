import assert from "node:assert/strict"
import test from "node:test"

import { getCameraScaleRange, shouldDisableDeviceCameraTransform } from "../src/camera-options"
import { cameraToSharedViewport, fitPageSizeToOrigin, getCameraReferenceSize, getFitScale, isValidSharedViewport } from "../src/camera-reference"

test("legacy disableCameraTransform keeps the fit-scale camera bound", () => {
  assert.deepEqual(getCameraScaleRange(0.5, 4, true), {
    minScale: 0.5,
    maxScale: 0.5,
  })
  assert.equal(shouldDisableDeviceCameraTransform({ disableCameraTransform: true }), true)
})

test("disableDeviceCameraTransform preserves programmatic 2x and 4x scaling", () => {
  const range = getCameraScaleRange(0.5, 4, false)

  assert.equal(shouldDisableDeviceCameraTransform({ disableDeviceCameraTransform: true }), true)
  assert.equal(Math.min(0.5 * 2, range.maxScale), 1)
  assert.equal(Math.min(0.5 * 4, range.maxScale), 2)
})

test("legacy camera bound wins when both options are enabled", () => {
  assert.deepEqual(getCameraScaleRange(0.5, 4, true), {
    minScale: 0.5,
    maxScale: 0.5,
  })
  assert.equal(
    shouldDisableDeviceCameraTransform({
      disableCameraTransform: true,
      disableDeviceCameraTransform: true,
    }),
    true
  )
})

test("originSize remains the camera reference", () => {
  const pageSize = { width: 714, height: 1010 }
  const originSize = { width: 1920, height: 1080 }

  assert.equal(getCameraReferenceSize(originSize, pageSize), originSize)
  assert.deepEqual(getCameraReferenceSize(undefined, pageSize), pageSize)
  assert.equal(getFitScale({ width: 960, height: 540 }, originSize), 0.5)
})

test("page size is proportionally contained within originSize", () => {
  const pageSize = { width: 714, height: 1010 }
  const originSize = { width: 1280, height: 720 }

  const fitted = fitPageSizeToOrigin(pageSize, originSize)

  assert.equal(fitted.height, 720)
  assert.ok(Math.abs(fitted.width - 508.990099009901) < 1e-9)
  assert.deepEqual(fitPageSizeToOrigin(fitted, originSize), fitted)
})

test("scale 1 contains the normalized page without changing the origin camera scale", () => {
  const viewSize = { width: 349.6875, height: 196.703125 }
  const originSize = { width: 1280, height: 720 }
  const fitted = fitPageSizeToOrigin({ width: 714, height: 1010 }, originSize)
  const originScale = getFitScale(viewSize, originSize)!

  assert.equal(originScale, 0.273193359375)
  assert.ok(fitted.width * originScale <= viewSize.width)
  assert.ok(fitted.height * originScale <= viewSize.height)
})

test("page size is maximized inside originSize and legacy size remains unchanged", () => {
  assert.deepEqual(
    fitPageSizeToOrigin({ width: 640, height: 360 }, { width: 1280, height: 720 }),
    { width: 1280, height: 720 }
  )
  assert.deepEqual(
    fitPageSizeToOrigin({ width: 714, height: 1010 }, undefined),
    { width: 714, height: 1010 }
  )
})

test("shared viewport preserves normalized origin scale across local view sizes", () => {
  const originSize = { width: 1920, height: 1080 }
  const landscapeViewport = cameraToSharedViewport(
    { centerX: 100, centerY: -50, scale: 0.5 },
    { width: 960, height: 540 },
    originSize
  )
  const portraitViewport = cameraToSharedViewport(
    { centerX: 100, centerY: -50, scale: 0.625 },
    { width: 1200, height: 1920 },
    originSize
  )

  assert.deepEqual(landscapeViewport, portraitViewport)
  assert.deepEqual(landscapeViewport, {
    originX: -860,
    originY: -590,
    width: 1920,
    height: 1080,
  })
})

test("shared viewport is restored only after it has complete finite dimensions", () => {
  assert.equal(isValidSharedViewport({ originX: -640, originY: -360, width: 1280, height: 720 }), true)
  assert.equal(isValidSharedViewport({ originX: 0, originY: 0, width: 0, height: 0 }), false)
  assert.equal(isValidSharedViewport({ originX: Number.NaN, originY: 0, width: 1280, height: 720 }), false)
})
