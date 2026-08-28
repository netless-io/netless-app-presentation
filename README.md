# @netless/app-presentation

[中文](https://github.com/netless-io/netless-app-presentation/blob/main/README-zh.md) 

A [Netless App](https://github.com/netless-io/netless-app) that display multiple images as presentation slides.

## Install

<pre>npm add <strong>@netless/app-presentation</strong></pre>

## Usage

```js
import { register } from "@netless/fastboard"
import { install } from "@netless/app-presentation"

install(register, { 
  as: 'DocsViewer',
  appOptions: {
    // Enable scrollbar feature
    useScrollbar: true,
    // Enable clip view feature, only show page content area
    useClipView: true,
    // Scrollbar event callbacks
    scrollbarEventCallback: {
      onScrollCameraUpdated: (appid, originScale, scale) => {
        console.log('Camera scale updated', appid, scale)
      },
      onScrollbarDragEnd: () => {
        console.log('Scrollbar drag ended')
      }
    }
  }
})
```

### Insert This App Into Room

Call [`fastboard.insertDocs()`](https://github.com/netless-io/fastboard#insert-pdf-ppt-and-pptx)
if you installed this app `{ as: 'DocsViewer' }`.

<details><summary>Otherwise&hellip;</summary>

```js
// Assume you have got the presentation pages as such data structure
const data = [
  // The [preview] field is optional
  { width: 1024, height: 768, url: 'url/to/1.png', preview: 'url/to/1.small.png' },
]

// Now call addApp()
fastboard.manager.addApp({
  kind: 'Presentation',
  options: {
    // folder name to mount whiteboard scenes
    // the same folder name will prevent you from insterting it again
    scenePath: `/presentation/foo`,
    // app window title
    title: 'a.pdf',
    // whiteboard scenes specification
    scenes: data.map((e, i) => ({
      name: String(i + 1),
      ppt: {
        src: e.url,
        width: e.width,
        height: e.height,
        previewURL: e.preview
      }
    }))
  }
})
```

Note that if you do not replace the DocsViewer app with `{ as: 'DocsViewer' }`,
the [`dispatchDocsEvent()`](https://github.com/netless-io/fastboard#control-the-pdfpptx-apps)
function won't work on the Presentation app. This is because that function only
handles app whose kind is `DocsViewer` or `Slide`.

</details>

### App Options

#### `disableDeviceCameraTransform`

Disable camera transforms initiated by local device input, such as mouse-wheel and touch gestures,
without changing the camera bound used by programmatic camera operations:

```js
const manager = await WindowManager.mount({
  room,
  container,
  builtinAppOptions: {
    Presentation: {
      disableDeviceCameraTransform: true,
    },
  },
})
```

This option is local and is not synchronized to other clients. Do not enable the legacy
`disableCameraTransform` option at the same time because it intentionally locks the camera bound
to the fitted page scale.

`useScrollbar` and `maxCameraScale` are independent options. `useScrollbar` is required by the
Presentation controller's programmatic `moveCamera` operation. `maxCameraScale` only controls its
upper scaling bound and defaults to `3`; set it to `4` only when the application needs
`scalePage({ scale: 4 })`.

#### `useScrollbar`
Enable scrollbar feature, providing horizontal and vertical scrollbars for navigation and viewing presentations.

```js
install(register, {
  as: 'DocsViewer',
  appOptions: {
    useScrollbar: true,
    scrollbarEventCallback: {
      onScrollCameraUpdated: (appid, originScale, scale) => {
        // Triggered when camera scale is updated
      },
      onScrollbarDragEnd: () => {
        // Triggered when scrollbar drag ends
      }
    }
  }
})
```

#### `useClipView`
Enable clip view feature, only show page content area, hide content outside the whiteboard area.

```js
install(register, {
  as: 'DocsViewer',
  appOptions: {
    useClipView: true
  }
})
```

### App Result API

#### `screenshotCurrentPageAsync(context, width?, height?)`
Asynchronously screenshot the current page to Canvas context. Supports custom width and height.

```js
const app = fastboard.manager.queryOne(appId)
if (app && app.kind === 'DocsViewer') {
  const controller = app.appResult
  const canvas = document.createElement('canvas')
  const { width, height } = controller.getPageSize()
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    await controller.screenshotCurrentPageAsync(ctx, width, height)
    // Use canvas for subsequent operations, such as exporting images
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'screenshot.png'
      a.click()
    })
  }
}
```

#### `getPageSize()`
Get the size (width and height) of the current page.

```js
const app = fastboard.manager.queryOne(appId)
if (app && app.kind === 'DocsViewer') {
  const controller = app.appResult
  const { width, height } = controller.getPageSize()
  console.log(`Current page size: ${width}x${height}`)
}
```

## Develop

See [Write you a Netless App](https://github.com/netless-io/fastboard/blob/main/docs/en/app.md).

To only develop the UI part, run:

```bash
$ pnpm build
$ pnpm dev
```

Then goto http://localhost:5173/ to see the app locally.

To develop it in a real whiteboard room, add a file .env.local containing the room's uuid and token,
then goto http://localhost:5173/e2e/.

## License

MIT @ [netless](https://github.com/netless-io)
