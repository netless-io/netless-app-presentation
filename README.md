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
