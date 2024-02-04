# @netless/app-presentation

A [Netless App](https://github.com/netless-io/netless-app) that display multiple images as presentation slides.

## Install

<pre>npm add <strong>@netless/app-presentation</strong></pre>

## Usage

```js
import { register } from "@netless/fastboard"
import { install } from "@netless/app-presentation"

install(register, { as: 'DocsViewer' })
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
