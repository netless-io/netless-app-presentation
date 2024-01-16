# @netless/app-slideshow

An [Netless App](https://github.com/netless-io/netless-app) that display multiple images as slides or presentations.

## Install

<pre>npm add <strong>@netless/app-slideshow</strong></pre>

## Usage

### 1. Register this app before joining room

```js
import { createFastboard } from "@netless/fastboard"
import NetlessAppSlideshow from "@netless/app-slideshow"

const fastboard = await createFastboard({
  ...roomConfig,
  netlessApps: [NetlessAppSlideshow]
})

// Or call the 'register' function
import { register } from "@netless/fastboard"

register({ kind: NetlessAppSlideshow.kind, src: NetlessAppSlideshow })
```

> [!TIP]
> You can replace `DocsViewer` (the default PDF Viewer app)
> with this app by same `kind`:
> ```js
> import NetlessAppSlideshow from "@netless/app-slideshow"
>
> const NetlessAppDocsViewer = {
>   ...NetlessAppSlideshow,
>   kind: 'DocsViewer'
> }
>
> const fastboard = await createFastboard({
>   ...roomConfig,
>   netlessApps: [NetlessAppDocsViewer]
> })
> ```

### 2. Add this app in room

> [!NOTE]
> You need to call a [file conversion](https://docs.agora.io/en/interactive-whiteboard/reference/whiteboard-api/file-conversion?platform=web#start-file-conversion)
> service to convert your PDF/PPT files into images before using this app.

```js
const resp = {
  uuid: "123456",
  images: {
    1: { width: 1280, height: 720, url: "https://placekitten.com/1280/720" }
  }
}

// If you did replace DocsViewer,
const appId = await fastboard.insertDocs("a.pdf", resp)

// Otherwise, you will need to manually construct the params
const appId = await fastboard.manager.addApp({
  kind: NetlessAppSlideshow.kind,
  options: {
    title: 'a.pdf',
    scenePath: `/pdf/${resp.uuid}`,
    scenes: Object.keys(resp.images).map(name => {
      const { width, height, url } = resp.images[name]
      return { name, ppt: { width, height, src: url } }
    })
  }
})
```

## Develop

See [Write you an Netless App](https://github.com/netless-io/fastboard/blob/main/docs/zh/app.md).

## License

MIT @ [netless](https://github.com/netless-io)
