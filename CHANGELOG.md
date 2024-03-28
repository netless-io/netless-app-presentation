# ChangeLog

## Unreleased

- Added app option `viewport` to customize initial viewport of the view.
- Removed the workaround where when the main room scene path changed,
  window-manager will update apps scenes to reflect that event.
  Make sure to upgrade `@netless/window-manager` to `0.4.70` to eventually fix that.

## 0.1.1

- Added `appOptions` to `install()`.
- Added app option `thumbnail(src)` to customize thumbnail generator logic.
- Fixed wrong warning about not setting `maxCameraScale`.
