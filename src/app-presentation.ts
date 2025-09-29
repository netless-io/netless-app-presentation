import type { AnimationMode, AppContext, AppPayload, NetlessApp, PublicEvent, ReadonlyTeleBox, Room, SceneDefinition, View, WindowManager } from "@netless/window-manager"

import { disposableStore } from '@wopjs/disposable'
import { listen } from '@wopjs/dom'

import styles from './style.scss?inline'
import { Presentation, type PresentationConfig, type PresentationPage } from "./presentation";
import { readable, type Readable } from "./store";
import { Scrollbar, type ScrollbarEventCallback } from "./scrollbar";

export type Logger = (...data: any[]) => void

const emptySceneName = '$$empty$$'

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentationAppOptions {
  /** Disables user move / scale the image and whiteboard. */
  disableCameraTransform?: boolean;
  /** Max scale = `maxCameraScale` * default scale. Not working when `disableCameraTransform` is true. Default: 3 */
  maxCameraScale?: number;
  /** Custom logger. Default: a logger that reports to the whiteboard server. */
  log?: Logger;
  /** Custom thumbnail generator. Default is appending `"?x-oss-process=image/resize,l_50"` to `src`. */
  thumbnail?: (src: string) => string;
  /**
   * Custom viewport to set on the first time the presentation was added. Default is full page.
   * Numbers range in 0 to 1 is considered a ratio to multiply the real page size.
   * Example settings:
   *
   * - Full page: `{ x: 0, y: 0, width: 1, height: 1 }`
   * - Half page: `{ x: 0, y: 0, width: 1, height: 0.5 }`
   * - Absolute top-left area of the page: `{ x: 0, y: 0, width: 100, height: 100 }`
   */
  viewport?: Viewport | ((page: PresentationPage) => Viewport);

  /** justDocsViewReadonly is used to set the presentation readonly, it will be used in the presentation, and the presentation will be readonly when the app is initialized */
  justDocsViewReadonly?: true;
  /** useScrollbar is used to set the presentation use scrollbar, it will be used in the presentation, and the presentation will be use scrollbar when the app is initialized */
  useScrollbar?: boolean;
  /** debounceSync is used to set the presentation debounce sync, it will be used in the presentation, and the presentation will be debounce sync when the app is initialized */
  debounceSync?: boolean;
  scrollbarEventCallback?: ScrollbarEventCallback
}

export interface PresentationController {
  readonly app: Presentation;
  readonly view: View;
  readonly context: AppContext;
  /** Returns false if failed to jump (either because out of bounds or lack of permissions). */
  jumpPage(index: number): boolean;
  /** Returns false if failed to jump */
  prevPage(): boolean;
  /** Returns false if failed to jump */
  nextPage(): boolean;
  /** `index` ranges from 0 to `length - 1` */
  pageState(): { index: number, length: number };

  toPdf(): Promise<{ pdf: ArrayBuffer, title: string } | null>;

  log: Logger;
  /** set the docs view readonly */
  setDocsViewReadonly: (bol: boolean) => void;
  /** set the presentation readonly */
  setReadonly: (bol: boolean) => void;
  /** move the camera */
  moveCamera: (camera: { centerX: number, centerY: number, scale: number }) => void;
  /** get the origin scale */
  getOriginScale: () => number;
  /** get the view scale */
  getScale: () =>number;
}

export { styles }

const ppt2page = (ppt: SceneDefinition["ppt"], name?: string): PresentationPage | null =>
  ppt ? { width: ppt.width, height: ppt.height, src: ppt.src, thumbnail: ppt.previewURL, name } : null

const createLogger = (room: Room | undefined): Logger => {
  if (room && (room as any).logger) {
    return (...args) => (room as any).logger.info(...args)
  } else {
    return (...args) => console.log(...args)
  }
}
``
const scenesEqual = (scenes1?: SceneDefinition[], scenes2?: SceneDefinition[]): boolean => {
  if (!scenes1 || !scenes2) {return false}
  if (scenes1.length !== scenes2.length) return false;
  return scenes1.every((scene, index) => {
    const scene2 = scenes2[index];
    return scene.name === scene2.name && 
           scene.ppt?.width === scene2.ppt?.width &&
           scene.ppt?.height === scene2.ppt?.height &&
           scene.ppt?.src === scene2.ppt?.src;
  });
};

export const NetlessAppPresentation: NetlessApp<{}, {}, PresentationAppOptions, PresentationController> = {
  kind: "Presentation",
  setup(context) {
    const view = context.getView()
    if (!view)
      throw new Error("[Presentation]: no whiteboard view, make sure you have added options.scenePath in addApp()")

    const pages = context.getScenes()?.map(({ ppt, name }) => ppt2page(ppt, name)).filter(Boolean) as PresentationPage[]
    if (!pages || pages.length === 0)
      throw new Error("[Presentation]: empty scenes, make sure you have added options.scenes in addApp()")
    if (pages[0].src.startsWith('ppt'))
      throw new Error("[Presentation]: legacy dynamic PPT is unsupported, please use the projector converter and @netless/slide to render it")

    // Now it must have a blank scene points to "{scenePath}/{scenes[0].name}", e.g. "/pdf/123456/1"
    // https://github.com/netless-io/window-manager/blob/c87df17/src/index.ts#L465-L476
    const scenePath = context.getInitScenePath()!

    const options = context.getAppOptions() || {}
    let maxCameraScale = options.maxCameraScale ?? 3
    if (!(Number.isFinite(maxCameraScale) && maxCameraScale! > 0)) {
      console.warn(`[Presentation] maxCameraScale should be a positive number, got ${options.maxCameraScale}`)
      maxCameraScale = 3
    }

    const log = options.log || createLogger(context.getRoom())
    log(`[Presentation] new ${context.appId}`)

    const dispose = disposableStore()
    dispose.add(() => log(`[Presentation] dispose ${context.appId}`))

    const view$$ = context.createStorage('view', { uid: "", originX: 0, originY: 0, width: 0, height: 0 })


    const _addScenePathListener = (
      name: keyof PublicEvent,
      listener: any
    ) => {
      const windowManger = (context as any).manager.windowManger as WindowManager;
      windowManger.emitter.on(name, listener)
      return () => windowManger?.emitter.off(name, listener)
    }

    const getPageIndex = (view: View) => {
      const focusScenePath = view.focusScenePath;
      const name = focusScenePath?.split('/').pop();
      let _pageIndex = pages.findIndex((page, index) => {
        const n = page.name ?? String(index + 1);
        return n === name;
      });
      if (_pageIndex === -1) {
        _pageIndex = 0;
      }
      return _pageIndex;
    }

    let pageIndex = getPageIndex(view);
    const pageIndex$ = readable<number>(pageIndex, set => {
      set(pageIndex);
      return _addScenePathListener("onAppScenePathChange", (payload: AppPayload)=>{
        const { appId } = payload;
        if (appId === context.appId) {
          const _pageIndex = getPageIndex(payload.view);
          set(_pageIndex)
        }
      });
    });

    dispose.add(() => {
      pageIndex$.dispose();
    })

    // Prepare scenes.
    // Caution: some user may insert a 500-page PDF.
    if (context.isAddApp) {
      if (pages.length > 100)
        console.warn(`[Presentation]: too many pages (${pages.length}), may cause performance issues`)

      let redirectResolve: ((bol:boolean) => void) | undefined = undefined;
      const room = context.getRoom();
      if (room && room.isWritable) {
        const scenes = room.entireScenes()[scenePath];
        if (pageIndex$.value < 0 || pageIndex$.value >= pages.length) {
          throw new Error(`[Presentation] Invalid page index: ${pageIndex$.value}, scenes length: ${pages.length}`);
        }
        new Promise((resolve) => {
          const {name, ppt} = scenes[pageIndex$.value];
          redirectResolve = resolve;
          const _scenes = pages.map((p, index) => ({
            name: p.name ?? String(index + 1),
            ppt: { width: p.width, height: p.height, src: p.src }
          }))
          
          if (!scenesEqual(scenes, _scenes)) {
            room.removeScenes(scenePath)
            room.putScenes(scenePath, _scenes)
          }
          if(name === _scenes[pageIndex$.value].name && !ppt){
            context.addPage({ scene: { name: emptySceneName } }).then(() => {
              log(`[Presentation] setup setScenePath ${scenePath}/${emptySceneName}`);
              context.setScenePath(`${scenePath}/${emptySceneName}`).then(()=>{
                redirectResolve && redirectResolve(true);
              })
            });
          } else {
            redirectResolve && redirectResolve(false)
          }
        }).then(async(bol)=>{
          await syncPage(pageIndex$.value, (room as any).logger);
          if (bol) {
            log(`[Presentation] setup removeScenes ${scenePath}/${emptySceneName}`);
            room.removeScenes(`${scenePath}/${emptySceneName}`);
          }
        });
      }
    }

    // let lastIndex = -1

    const me = context.getRoom()?.uid || context.getDisplayer().observerId + ''

    let throttleSyncView = 0

    const syncPage = async (index: number, logger?: any) => {

      if (!context.getIsWritable()) return

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) return

      const p = pages[index];
      const name = p.name ?? String(index + 1);

      // "Prepare scenes" may not run correctly if the user suddenly disconnected after adding the app.
      // So here we add the missing pages again if not found. This is rare to happen.
      if (!scenes.some(scene => scene.name === name)) {
        await context.addPage({ scene: { name, ppt: { width: p.width, height: p.height, src: p.src } } })
      }

      if (logger) {
        logger.info(`[Presentation] syncPage ${scenePath}/${name}`);
      }

      // Switch to that page.
      await context.setScenePath(`${scenePath}/${name}`)
    }

    const jumpPage = (index: number): boolean => {
      if (!context.getIsWritable()) {
        console.warn('[Presentation]: no permission, make sure you have test room.isWritable')
        return false
      }

      if (!(0 <= index && index < pages.length)) {
        console.warn(`[Presentation]: page ${index + 1} out of bounds [1, ${pages.length}]`)
        return false
      }

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) {
        console.warn(`[Presentation]: no scenes found at ${scenePath}, make sure you have added options.scenePath in addApp()`)
        return false
      }

      const p = pages[index];
      const name = p.name ?? String(index + 1);

      if (!scenes.some(scene => scene.name === name)) {
        context.addPage({ scene: { name, ppt: { width: p.width, height: p.height, src: p.src } } })
      }

      syncPage(index);
      return true
    }

    const prevPage = () => jumpPage(pageIndex$.value - 1)
    const nextPage = () => jumpPage(pageIndex$.value + 1)
    const pageState = () => ({ index: pageIndex$.value, length: pages.length })

    const scaleDocsToFit = () => {
      const { width, height } = app.page() || {}
      if (width && height) {
        view.moveCameraToContain({
          originX: -width / 2, originY: -height / 2, width, height,
          animationMode: 'immediately' as AnimationMode.Immediately
        })
        const maxScale = view.camera.scale * (options.disableCameraTransform ? 1 : maxCameraScale)
        const minScale = view.camera.scale
        view.setCameraBound({
          damping: 1,
          maxContentMode: () => maxScale,
          minContentMode: () => minScale,
          centerX: 0, centerY: 0, width, height
        })
        syncViewFromRemote(true)
      }
    }
    const syncView = () => {
      if (context.getIsWritable()) {
        if (options.debounceSync) {
          clearTimeout(throttleSyncView);
          throttleSyncView = 0;
        }
        if (throttleSyncView > 0) return
        const { width, height } = app.page() || {}
        if(width && height){
          throttleSyncView = setTimeout(() => {
            throttleSyncView = 0
            const { camera, size } = view;
            const fixedW = Math.min(size.width, size.height * width / height)
            const fixedH = Math.min(size.height, size.width * height / width)
            const w = fixedW / camera.scale
            const h = fixedH / camera.scale
            const x = camera.centerX - w / 2
            const y = camera.centerY - h / 2
            view$$.setState({ uid: me, originX: x, originY: y, width: w, height: h })
          }, 50)
        }
      }
    }

    dispose.add(() => {
      clearTimeout(throttleSyncView)
      throttleSyncView = 0
    })

    const syncViewFromRemote = (force = false, animate = false) => {
      const { uid, originX, originY, width, height } = view$$.state
      if ((force || uid !== me) && width > 0 && height > 0) {
        view.moveCameraToContain({
          originX, originY, width, height,
          animationMode: (animate ? 'continuous' : 'immediately') as AnimationMode
        })
      }
    }

    dispose.add(view$$.addStateChangedListener(() => syncViewFromRemote(false, true)))

    const box = context.getBox()
    const app = dispose.add(createPresentation(box, pages, jumpPage, pageIndex$, options.thumbnail))
    app.contentDOM.dataset.appPresentationVersion = __VERSION__
    app.scaleDocsToFit = scaleDocsToFit
    app.log = log

    if (options.justDocsViewReadonly) {
      app.setDocsViewReadonly(true)
    }

    context.mountView(app.whiteboardDOM)
    if (options.disableCameraTransform) {
      view.disableCameraTransform = true
    }
    scaleDocsToFit()
    dispose.make(() => {
      view.callbacks.on('onSizeUpdated', scaleDocsToFit)
      return () => view.callbacks.off('onSizeUpdated', scaleDocsToFit)
    })

    // Init viewport if provided `viewport`.
    if (options.viewport && context.isAddApp && app.page()) {
      const page = app.page()!
      const viewport = typeof options.viewport === 'function' ? options.viewport(page) : options.viewport
      const fix = (i: number, x: number) => i == 0 ? i : i <= 1 ? i * x : i
      view$$.setState({
        uid: me,
        originX: fix(viewport.x, page.width) - page.width / 2,
        originY: fix(viewport.y, page.height) - page.height / 2,
        width: fix(viewport.width, page.width),
        height: fix(viewport.height, page.height),
      })
    }

    dispose.make(() => {
      view.callbacks.on('onCameraUpdatedByDevice', syncView)
      return () => view.callbacks.off('onCameraUpdatedByDevice', syncView)
    })
    syncViewFromRemote(true)

    dispose.add(context.emitter.on("writableChange", (isWritable: boolean): void => {
      app.setReadonly(!isWritable)
    }))

    const getPageSize = () => {
      const { width, height } = app.page() || {}
      return { width: width || 0, height: height || 0 }
    }

    const getOriginScale = () => {
      const { size } = view;
      const { width, height } = getPageSize();
      return Math.min(size.height / height, size.width / width);
    }

    const getScale =() => {
      return view.camera.scale
    }

    const moveCamera = (camera: { centerX: number, centerY: number, scale: number }) => {
      if (context.getIsWritable()) {
        view.moveCamera({...camera, animationMode: 'immediately' as AnimationMode});
        syncView();
        return;
      }
      throw new Error('[Presentation]: moveCamera must be called in writable room')
    }

    let scrollbar:Scrollbar | undefined;
    if (options.useScrollbar) {
      dispose.make(() => {
        scrollbar = new Scrollbar(app.contentDOM, { 
          appId: context.appId,
          getPageSize,
          getOriginScale,
          syncView,
          getWritable: () => context.getIsWritable(),
          scrollbarEventCallback: options.scrollbarEventCallback
        }, view)
        return () => scrollbar?.destroy()
      })
    }

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
        const p = pages[index];
        const { width, height, src } = p;

        const url = await base64url(src)
        const img = document.createElement('img')
        await new Promise(resolve => { img.onload = resolve; img.src = url })
        stage.drawImage(img, 0, 0)

        wb.clearRect(0, 0, pdfWidth, pdfHeight)
        const name = p.name ?? String(index + 1)
        if (scenes.some(scene => scene.name == name)) {
          const camera = { centerX: 0, centerY: 0, scale: Math.min(wb_canvas.width / width, wb_canvas.height / height) };
          const sPath = `${scenePath}/${index + 1}`;
          // appliancePlugin is a performance optimization for whiteboard;
          const windowManger = (context as any).manager.windowManger as any
          if (windowManger._appliancePlugin) {
            await windowManger._appliancePlugin.screenshotToCanvasAsync(wb, sPath, wb_canvas.width, wb_canvas.height, camera);
          } else {
            view.screenshotToCanvas(
              wb, sPath,
              wb_canvas.width, wb_canvas.height,
              camera,
            )
          }

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

    const setDocsViewReadonly = (bol: boolean) => {
      app.setDocsViewReadonly(bol)
    }

    const setReadonly = (bol: boolean) => {
      app.setReadonly(bol)
      if(scrollbar) {
        scrollbar.setReadonly(bol)
      }
    }

    const controller: PresentationController = { app, view, context, jumpPage, prevPage, nextPage, pageState, toPdf, log, setDocsViewReadonly, setReadonly, moveCamera, getOriginScale, getScale }

    dispose.add(listen(window, 'message', (ev: MessageEvent<"@netless/_presentation_">) => {
      if (ev.data === "@netless/_presentation_") {
        if (typeof window !== 'undefined') dispose.make(() => {
          const debug: Set<PresentationController> = ((window as any)._presentation_ ||= new Set())
          debug.add(controller)
          return () => debug.delete(controller)
        })
        console.log(controller)
      }
    }))

    return controller
  }
}

/**
 * Add synchronization to the local presentation.
 */
class AppPresentation extends Presentation {
  log?: Logger;
  box?: ReadonlyTeleBox;
  scaleDocsToFit?: () => void;
  readonly jumpPage: (index: number) => void

  constructor(config: PresentationConfig & { jumpPage: (index: number) => void }) {
    super(config)
    this.jumpPage = config.jumpPage
    this.image.style.display = 'none'
  }

  override updateImage() {
    // Do nothing, the image was set in the whiteboard scene.
    super.updateImage();
  }

  override onNewPageIndex(index: number, origin: "navigation" | "keydown" | "input" | "preview") {
    // If it is triggered by global keydown (left or right arrow),
    // only the focused one should work
    if (origin === "keydown" && this.box && !this.box.focus)
      return
    if (this.log)
      this.log("[Presentation] user navigate to", index + 1, `(${origin})`)
    if (0 <= index && index < this.pages.length) {
      this.jumpPage(index)
    } else {
      console.warn(`[Presentation]: page index ${index} out of bounds [0, ${this.pages.length - 1}]`)
    }
  }
}

function createPresentation(
  box: ReadonlyTeleBox,
  pages: PresentationPage[],
  jumpPage: (index: number) => void,
  pageIndex$: Readable<number>,
  thumbnail?: (src: string) => string,
): AppPresentation {
  box.mountStyles(styles)

  const app = new AppPresentation({ pages, readonly: box.readonly, jumpPage, thumbnail })
  app.box = box
  box.mountContent(app.contentDOM)
  box.mountFooter(app.footerDOM)

  app.dispose.add(pageIndex$.subscribe(pageIndex => { app.setPageIndex(pageIndex) }))

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
  /**
   * Options to customize the local app (not synced to others).
   */
  appOptions?: PresentationAppOptions
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
  return register({ kind: app.kind, src: app, appOptions: options.appOptions })
}
