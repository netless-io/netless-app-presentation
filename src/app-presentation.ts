import type { AnimationMode, NetlessApp, ReadonlyTeleBox, SceneDefinition, Storage, View, WindowManager } from "@netless/window-manager"

import { disposableStore } from '@wopjs/disposable'
import { listen } from '@wopjs/dom'

import styles from './style.scss?inline'
import { Presentation, type PresentationConfig } from "./presentation";

export interface PresentationPage {
  src: string;
  width: number;
  height: number;
  thumbnail: string | undefined;
}

export interface PresentationController {
  readonly app: Presentation;
  readonly view: View;
  /** Returns false if failed to jump (either because out of bounds or lack of permissions). */
  jumpPage(index: number): boolean;
  /** Returns false if failed to jump */
  prevPage(): boolean;
  /** Returns false if failed to jump */
  nextPage(): boolean;
  /** `index` ranges from 0 to `length - 1` */
  pageState(): { index: number, length: number };

  toPdf(): Promise<{ pdf: ArrayBuffer, title: string } | null>;
}

export { styles }

const ppt2page = (ppt: SceneDefinition["ppt"]): PresentationPage | null =>
  ppt ? { width: ppt.width, height: ppt.height, src: ppt.src, thumbnail: ppt.previewURL } : null

export const NetlessAppPresentation: NetlessApp<{}, unknown, unknown, PresentationController> = {
  kind: "Presentation",
  setup(context) {
    const view = context.getView()
    if (!view)
      throw new Error("[Presentation]: no whiteboard view, make sure you have add options.scenePath in addApp()")

    const pages = context.getScenes()?.map(({ ppt }) => ppt2page(ppt)).filter(Boolean) as PresentationPage[]
    if (!pages || pages.length === 0)
      throw new Error("[Presentation]: empty scenes, make sure you have add options.scenes in addApp()")
    if (pages[0].src.startsWith('ppt'))
      throw new Error("[Presentation]: legacy dynamic PPT is unsupported, please use the projector converter and @netless/slide to render it")

    // Now it must have a blank scene points to "{scenePath}/{scenes[0].name}", e.g. "/pdf/123456/1"
    // https://github.com/netless-io/window-manager/blob/c87df1710867423dcfdbff485b9dbee9270ea409/src/index.ts#L465-L476
    const scenePath = context.getInitScenePath()!

    // In this "presentation" app, we need different scenes to cover different pages.
    // Call context.getRoom()?.putScenes(context.getInitScenePath()!, [{ name: '2' }]) to add more scenes.

    // Caution: some user may insert a 500-page PDF.

    const dispose = disposableStore()

    const page$$ = context.createStorage('page', { index: 0 })

    const syncPage = (index: number) => {
      context.dispatchAppEvent('pageStateChange', { index, length: pages.length })
      if (!context.getIsWritable()) return

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) return

      const name = String(index + 1)
      if (scenes.some(scene => scene.name === name)) {
        context.setScenePath(`${scenePath}/${name}`)
      }

      else {
        const room = context.getRoom()
        if (!room) return

        room.putScenes(scenePath, [{ name }])
        context.setScenePath(`${scenePath}/${name}`)
      }
    }

    const jumpPage = (index: number): boolean => {
      if (!context.getIsWritable()) {
        console.warn('[Presentation]: not writable, make sure you have test room.isWritable')
        return false
      }

      if (!(0 <= index && index < pages.length)) {
        console.warn(`[Presentation]: page index ${index} out of bounds [0, ${pages.length - 1}]`)
        return false
      }

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) {
        console.warn(`[Presentation]: no scenes found at ${scenePath}, make sure you have add options.scenePath in addApp()`)
        return false
      }

      page$$.setState({ index })
      return true
    }

    const prevPage = () => jumpPage(page$$.state.index - 1)
    const nextPage = () => jumpPage(page$$.state.index + 1)
    const pageState = () => ({ index: page$$.state.index, length: pages.length })

    const scaleDocsToFit = () => {
      const { width, height } = app.page() || {}
      if (width && height) {
        view.moveCameraToContain({
          originX: -width / 2, originY: -height / 2, width, height,
          animationMode: 'immediately' as AnimationMode.Immediately
        })
        view.setCameraBound({
          damping: 1,
          maxContentMode: () => view.camera.scale,
          minContentMode: () => view.camera.scale,
          centerX: 0, centerY: 0, width, height
        })
      }
    }

    syncPage(page$$.state.index)
    dispose.add(page$$.addStateChangedListener(() => syncPage(page$$.state.index)))

    const box = context.getBox()
    const app = dispose.add(createPresentation(box, pages, jumpPage, page$$))
    app.scaleDocsToFit = scaleDocsToFit

    context.mountView(app.whiteboardDOM)
    view.disableCameraTransform = true
    scaleDocsToFit()
    dispose.make(() => {
      view.callbacks.on('onSizeUpdated', scaleDocsToFit)
      return () => view.callbacks.off('onSizeUpdated', scaleDocsToFit)
    })

    dispose.add(context.emitter.on("writableChange", (isWritable: boolean): void => {
      app.setReadonly(!isWritable)
    }))

    context.emitter.on('destroy', () => dispose())

    const reportProgress = (progress: number, result: { pdf: ArrayBuffer, title: string } | null) => {
      window.postMessage({ type: '@netless/_result_save_pdf_', appId: context.appId, progress, result }, '*')
      return result
    }

    const base64url = async (url: string): Promise<string> => {
      try {
        const a = new URL(url)
        a.searchParams.set('t', Date.now().toString())
        url = a.toString()
      } catch {}

      const data = await fetch(url)
      if (!data.ok) throw new Error(`[Presentation]: failed to fetch ${url} - ${await data.text()}`)

      const blob = await data.blob()
      const reader = new FileReader()
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    }

    const toPdf = async (): Promise<{ pdf: ArrayBuffer, title: string } | null> => {
      const MAX = 1920
      const firstPage = pages[0]
      const { width, height } = firstPage
      let pdfWidth = Math.floor(width), pdfHeight = Math.floor(height)
      if (pdfWidth > MAX) {
        pdfWidth = MAX
        pdfHeight = Math.floor(height * pdfWidth / width)
      }
      if (pdfHeight > MAX) {
        pdfHeight = MAX
        pdfWidth = Math.floor(width * pdfHeight / height)
      }
      const scenes = context.getDisplayer().entireScenes()[scenePath]

      const stage_canvas = document.createElement('canvas')
      stage_canvas.width = pdfWidth
      stage_canvas.height = pdfHeight
      const stage = stage_canvas.getContext('2d')

      const wb_canvas = document.createElement('canvas')
      wb_canvas.width = pdfWidth
      wb_canvas.height = pdfHeight
      const wb = wb_canvas.getContext('2d')
      if (!wb || !stage) return reportProgress(100, null)

      const { jsPDF } = await import("jspdf")
      const pdf = new jsPDF({
        format: [firstPage.width, firstPage.height],
        orientation: firstPage.width > firstPage.height ? 'l' : 'p',
        compress: true,
      })

      for (let index = 0; index < pages.length; ++index) {
        const { width, height, src } = pages[index]

        const url = await base64url(src)
        const img = document.createElement('img')
        await new Promise(resolve => { img.onload = resolve; img.src = url })
        stage.drawImage(img, 0, 0)

        wb.clearRect(0, 0, pdfWidth, pdfHeight)
        if (scenes.some(scene => scene.name == String(index + 1))) {
          view.screenshotToCanvas(
            wb, `${scenePath}/${index + 1}`,
            wb_canvas.width, wb_canvas.height,
            { centerX: 0, centerY: 0, scale: Math.min(wb_canvas.width / width, wb_canvas.height / height) },
          )
          try {
            const wb_url = wb_canvas.toDataURL('image/png')
            const wb_img = document.createElement('img')
            await new Promise(resolve => { wb_img.onload = resolve; wb_img.src = wb_url })
            stage.drawImage(wb_img, 0, 0, pdfWidth, pdfHeight)
          } catch (err) {
            console.warn(err)
          }
        }

        const output = stage_canvas.toDataURL('image/jpeg', 0.6)
        if (index > 0) pdf.addPage()

        pdf.addImage(output, 'JPEG', 0, 0, pdfWidth, pdfHeight, "", "FAST")
        stage.clearRect(0, 0, pdfWidth, pdfHeight)
        const progress = Math.ceil((index + 1) / pages.length * 100)
        if (progress < 100) reportProgress(progress, null)
      }

      const data = pdf.output('arraybuffer')
      const title = box.title
      return reportProgress(100, { pdf: data, title })
    }

    dispose.add(listen(window, 'message', (ev: MessageEvent<{ appId: string, type: "@netless/_request_save_pdf_" }>) => {
      if (ev.data && ev.data.type == '@netless/_request_save_pdf_' && ev.data.appId == context.appId) {
        toPdf().catch(err => { console.warn(err); reportProgress(100, null) })
      }
    }))

    return { app, view, jumpPage, prevPage, nextPage, pageState, toPdf }
  }
}

/**
 * Add synchronization to the local presentation.
 */
class AppPresentation extends Presentation {
  scaleDocsToFit?: () => void;
  readonly jumpPage: (index: number) => void
  constructor(config: PresentationConfig & { jumpPage: (index: number) => void }) {
    super(config)
    this.jumpPage = config.jumpPage
  }
  override onNewPageIndex(index: number) {
    if (0 <= index && index < this.pages.length) {
      this.jumpPage(index)
    } else {
      console.warn(`[Presentation]: page index ${index} out of bounds [0, ${this.pages.length - 1}]`)
    }
  }
}

const createPresentation = (
  box: ReadonlyTeleBox,
  pages: PresentationPage[],
  jumpPage: (index: number) => void,
  page$$: Storage<{ index: number }>,
) => {
  box.mountStyles(styles)

  const app = new AppPresentation({ pages, readonly: box.readonly, jumpPage })
  box.mountContent(app.contentDOM)
  box.mountFooter(app.footerDOM)

  app.setPageIndex(page$$.state.index)
  app.dispose.add(page$$.addStateChangedListener(() => {
    app.setPageIndex(page$$.state.index)
  }))

  return app
}

export type RegisterFn = typeof WindowManager["register"]

export interface InstallOptions {
  /**
   * Register as another "kind", to hijack existing apps.
   * The default kind is "Presentation".
   * 
   * @example "DocsViewer"
   */
  as?: string
}

/**
 * Call `register({ kind: "Presentation", src: NetlessAppPresentation })` to register this app.
 * Optionally accepts an options object to override the default kind.
 * 
 * @example install(register, { as: "DocsViewer" })
 */
export const install = (register: RegisterFn, options: InstallOptions = {}): Promise<void> => {
  let app = NetlessAppPresentation
  if (options.as) {
    app = Object.assign({}, app, { kind: options.as })
  }
  return register({ kind: app.kind, src: app })
}