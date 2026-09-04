# @netless/app-presentation

一个 [Netless App](https://github.com/netless-io/netless-app)，用于将多张图片作为演示文稿幻灯片展示。

## 安装

<pre>npm add <strong>@netless/app-presentation</strong></pre>

## 使用方法

```js
import { register } from "@netless/fastboard"
import { install } from "@netless/app-presentation"

install(register, { 
  as: 'DocsViewer',
  appOptions: {
    // 启用滚动条功能
    useScrollbar: true,
    // 启用裁剪视图功能，只显示页面内容区域
    useClipView: true,
    // 滚动条事件回调
    scrollbarEventCallback: {
      onScrollCameraUpdated: (appid, originScale, scale) => {
        console.log('相机缩放已更新', appid, scale)
      },
      onScrollbarDragEnd: () => {
        console.log('滚动条拖拽已结束')
      }
    }
  }
})
```

### 将应用插入房间

如果你以 `{ as: 'DocsViewer' }` 的方式安装了这个应用，请调用 [`fastboard.insertDocs()`](https://github.com/netless-io/fastboard#insert-pdf-ppt-and-pptx)。

<details><summary>否则&hellip;</summary>

```js
// 假设你已经获得了演示文稿页面的数据结构
const data = [
  // [preview] 字段是可选的
  { width: 1024, height: 768, url: 'url/to/1.png', preview: 'url/to/1.small.png' },
]

// 现在调用 addApp()
fastboard.manager.addApp({
  kind: 'Presentation',
  options: {
    // 挂载白板场景的文件夹名称
    // 相同的文件夹名称将防止你再次插入
    scenePath: `/presentation/foo`,
    // 应用窗口标题
    title: 'a.pdf',
    // 白板场景规范
    scenes: data.map((e, i) => ({
      name: String(i + 1),
      ppt: {
        src: e.url,
        width: e.width,
        height: e.height,
        previewURL: e.preview
      }
    }))
  },
  attributes: {
    originSize: { width: 1280, height: 720 }
  }
})
```

配置 `originSize` 后，它表示 `scale = 1` 时的共享白板原始尺寸。Presentation 在写入白板
scene 前，将每页 `ppt.width/ppt.height` 按原始宽高比等比 contain 到 `originSize`：

```text
ratio = min(originSize.width / ppt.width, originSize.height / ppt.height)
scenePpt.width  = ppt.width * ratio
scenePpt.height = ppt.height * ratio
```

图片 URL 不变。归一化后的尺寸同时用于 scene、CameraBound、滚动条和裁剪范围，因此相对倍率为
`1` 时页面以最大等比例完整显示，不出现滚动条。切页时如果 shared viewport 已建立，会直接恢复
该 viewport 并保持当前相对 scale，不会先应用一次中间 fit camera。未配置 `originSize` 时继续
直接使用输入的 `ppt.width/ppt.height`。

请注意，如果你没有使用 `{ as: 'DocsViewer' }` 替换 DocsViewer 应用，
[`dispatchDocsEvent()`](https://github.com/netless-io/fastboard#control-the-pdfpptx-apps)
函数将无法在 Presentation 应用上工作。这是因为该函数只处理类型为 `DocsViewer` 或 `Slide` 的应用。

</details>

### 应用选项

#### `disableDeviceCameraTransform`

禁止鼠标滚轮、触摸手势等本地设备输入改变相机，但不改变程序化相机操作使用的
CameraBound：

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

该配置仅在本地客户端生效，不会同步给其他客户端。不要同时启用旧的
`disableCameraTransform`，因为旧配置会按原有语义将 CameraBound 锁定到页面适配缩放。

`useScrollbar` 和 `maxCameraScale` 是相互独立的配置。Presentation Controller 的程序化
`moveCamera` 要求启用 `useScrollbar`；`maxCameraScale` 只控制程序化缩放上限，默认值为
`3`，只有业务需要调用 `scalePage({ scale: 4 })` 时才需要设为 `4`。

#### `useScrollbar`
启用滚动条功能，提供水平和垂直滚动条用于导航和查看演示文稿。

```js
install(register, {
  as: 'DocsViewer',
  appOptions: {
    useScrollbar: true,
    scrollbarEventCallback: {
      onScrollCameraUpdated: (appid, originScale, scale) => {
        // 当相机缩放更新时触发
      },
      onScrollbarDragEnd: () => {
        // 当滚动条拖拽结束时触发
      }
    }
  }
})
```

#### `useClipView`
启用裁剪视图功能，只显示页面内容区域，隐藏白板区域外的内容。

```js
install(register, {
  as: 'DocsViewer',
  appOptions: {
    useClipView: true
  }
})
```

### 应用结果 API

#### `screenshotCurrentPageAsync(context, width?, height?)`
异步截图当前页面到 Canvas 上下文。支持自定义宽度和高度。

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
    // 使用 canvas 进行后续操作，如导出图片
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("context.toBlob() 失败！")
        return
      }
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
获取当前页面在白板 scene 中的尺寸（宽度和高度）。配置 `originSize` 时返回等比归一化后的尺寸。

```js
const app = fastboard.manager.queryOne(appId)
if (app && app.kind === 'DocsViewer') {
  const controller = app.appResult
  const { width, height } = controller.getPageSize()
  console.log(`当前页面尺寸: ${width}x${height}`)
}
```

## 开发

参见 [编写 Netless App](https://github.com/netless-io/fastboard/blob/main/docs/en/app.md)。

如果只想开发 UI 部分，运行：

```bash
$ pnpm build
$ pnpm dev
```

然后访问 http://localhost:5173/ 在本地查看应用。

要在真实的白板房间中开发，请添加一个包含房间 uuid 和 token 的 .env.local 文件，
然后访问 http://localhost:5173/e2e/。

## 许可证

MIT @ [netless](https://github.com/netless-io)
