# ChangeLog

## 0.1.13-beta.4 (2026-09-24)

- In lazy WindowManager hosts, wait for the current page image's actual ready state after the five-second warning threshold; preserve bounded setup for legacy and eager hosts.
- Reconcile focus, host activity, and browser visibility before restoring or suspending cached resources; deduplicate repeated blur resource cleanup.
- Cover the new readiness and runtime activity transitions in tests.

## 0.1.13-beta.3 (2026-09-24)

- Fast-fail the setup ready wait when the current page background image request has failed; an image element without a source still waits for the SDK to assign one, and a failed load logs its own warning instead of consuming the whole timeout.
- Make the runtime teardown fault-tolerant: missing host unmount APIs or one failing mount no longer skip the remaining cleanup, errors still propagate, and teardown stays idempotent.
- Stop preload from re-assigning `href` in an error retry loop: a failed page is marked error and retried only on explicit revisit or focus restore; stale `onload`/`onerror` callbacks after pause/resume/dispose are ignored via link identity, and a disposed preload accepts no new work.
- Add the runtime-resources test suite (30/30 total) and document the lazy lifecycle WindowManager floor (1.0.23-beta.1+), the background degradation scope, and the best-effort preload behavior in the READMEs.

## 0.1.13-beta.2 (2026-09-21)

- Complete the Presentation runtime teardown contract by disposing the app and unmounting TeleBox content, footer, and styles idempotently.
- Suspend cached, unfocused Presentation resources: keep usable thumbnails, and hide GIF or no-thumbnail backgrounds behind a static pixel while preserving the measurable view container.
- Release loaded preview image resources while cached and restore the current page and preload behavior when focus returns.
- Observe TeleBox focus classes so resource suspension also follows host updates that intentionally suppress focus and blur events.

## 0.1.13-beta.0 (2026-09-16)

- Add static `NetlessAppPresentation.teardown(context)` so the host can manually dispose a Presentation app instance; teardown is idempotent and still runs automatically on the `destroy` event.
- Reformat `app-presentation.ts` with Prettier without changing behavior.

## 0.1.12 (2026-09-11)

- Treat every valid `originSize` attribute as the Presentation coordinate reference without requiring an internal storage version marker.
- Stop writing `_originSizeCoordinateVersion` to App storage.

## 0.1.11 (2026-08-31)

- Add `disableDeviceCameraTransform` to disable local device camera input without restricting programmatic scaling up to `maxCameraScale`.
- Add completion-aware `jumpPageAsync`, `prevPageAsync`, and `nextPageAsync` controller methods so WindowManager can report asynchronous page command failures.

## 0.1.9
- Fix: devDependencies `lodash`

## 0.1.9
- Feat: add scrollbar
- Feat: add appOptions: `useClipView` and appResult: `screenshotCurrentPageAsync`、`getPageSize`

## 0.1.8 (2025-06-20)
- Fix the issue of inconsistent page synchronization between the scene and the app

## 0.1.7 (2025-06-10)
- Added app option `justDocsViewReadonly` to customize initial.
- Added app result `setDocsViewReadonly(isReadonly:boolean)`. in the write permission, 
  just set docsView readonly, whiteboard keeps writable.
  
- update `@netless/fastboard@^1.0.6`
- update `@netless/window-manager@^1.0.4`

## 0.1.5 (2024-11-25)
- fix when scenes only one and name is name toString

## 0.1.4 (2024-11-25)
- toPdf support show appliancePlugin elements

## 0.1.3 (2024-09-11)
- Optimize the preload mechanism
- debounce updateImage to 200ms

## 0.1.2 (2024-03-28)

- Added app option `viewport` to customize initial viewport of the view.
- Removed the workaround where when the main room scene path changed,
  window-manager will update apps scenes to reflect that event.
  Make sure to upgrade `@netless/window-manager` to `0.4.70` to eventually fix that.

## 0.1.1

- Added `appOptions` to `install()`.
- Added app option `thumbnail(src)` to customize thumbnail generator logic.
- Fixed wrong warning about not setting `maxCameraScale`.
