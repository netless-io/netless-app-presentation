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
  }
})
```

请注意，如果你没有使用 `{ as: 'DocsViewer' }` 替换 DocsViewer 应用，
[`dispatchDocsEvent()`](https://github.com/netless-io/fastboard#control-the-pdfpptx-apps)
函数将无法在 Presentation 应用上工作。这是因为该函数只处理类型为 `DocsViewer` 或 `Slide` 的应用。

</details>

### 应用选项

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
获取当前页面的尺寸（宽度和高度）。

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
