# ChangeLog

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
