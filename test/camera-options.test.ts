import assert from "node:assert/strict"
import test from "node:test"

import { getCameraScaleRange, shouldDisableDeviceCameraTransform } from "../src/camera-options"
import { cameraToSharedViewport, getCameraReferenceSize, getFitScale } from "../src/camera-reference"

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

test("originSize is the camera reference without changing page size", () => {
  const pageSize = { width: 714, height: 1010 }
  const originSize = { width: 1920, height: 1080 }

  assert.equal(getCameraReferenceSize(originSize, pageSize), originSize)
  assert.deepEqual(getCameraReferenceSize(undefined, pageSize), pageSize)
  assert.equal(getFitScale({ width: 960, height: 540 }, originSize), 0.5)
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
