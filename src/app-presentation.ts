import type { AnimationMode, AppContext, AppPayload, NetlessApp, PublicEvent, ReadonlyTeleBox, Room, SceneDefinition, Size, View, WindowManager } from "@netless/window-manager"

import { disposableStore } from '@wopjs/disposable'
import { listen } from '@wopjs/dom'

import styles from './style.scss?inline';
import { Presentation, type PresentationConfig, type PresentationPage } from "./presentation";
import { readable, type Readable } from "./store";
import { Scrollbar, type ScrollbarEventCallback } from "./scrollbar";
import { getCameraScaleRange, shouldDisableDeviceCameraTransform } from "./camera-options";
import { cameraToSharedViewport, getCameraReferenceSize, getFitScale, isValidSize } from "./camera-reference";
import debounce from "lodash/debounce";

export type Logger = (...data: any[]) => void

interface PresentationDiagnosticLogger {
  info(event: string, payload?: unknown): void;
  warn(event: string, payload?: unknown): void;
  error(event: string, error: unknown, payload?: unknown): void;
  debouncedInfo(event: string, payload?: unknown): void;
  flush(): void;
}

type MoveCameraRequest = { centerX: number, centerY: number, scale: number }

const emptySceneName = '$$empty$$'

export interface PresentationAttributes {
  /** Shared logical camera reference size. The page image keeps its original size. */
  originSize?: Size | null;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentationAppOptions {
  /** Disables user move / scale the image and whiteboard. */
  disableCameraTransform?: boolean;
  /** Disables camera transforms from local device input without restricting programmatic scaling. */
  disableDeviceCameraTransform?: boolean;
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
  /** Shows draggable scrollbars. This does not affect PresentationController.moveCamera(). */
  useScrollbar?: boolean;
  /** debounceSync is used to set the presentation debounce sync, it will be used in the presentation, and the presentation will be debounce sync when the app is initialized */
  debounceSync?: boolean;
  scrollbarEventCallback?: ScrollbarEventCallback
  /** goToPageByClick is used to set the presentation go to page by click, it will be used in the presentation, and the presentation will be go to page by click when the app is initialized */
  goToPageByClick?: boolean;
  /** useClipView is used to set the presentation use clip view, it will be used in the presentation, and the presentation will be use clip view when the app is initialized */
  useClipView?: boolean;
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
  /** Resolves after the whiteboard View has accepted the target scene path. */
  jumpPageAsync(index: number): Promise<boolean>;
  /** Resolves after the whiteboard View has accepted the previous scene path. */
  prevPageAsync(): Promise<boolean>;
  /** Resolves after the whiteboard View has accepted the next scene path. */
  nextPageAsync(): Promise<boolean>;
  /** `index` ranges from 0 to `length - 1` */
  pageState(): { index: number, length: number };

  toPdf(): Promise<{ pdf: ArrayBuffer, title: string } | null>;

  log: Logger;
  /** set the docs view readonly */
  setDocsViewReadonly: (bol: boolean) => void;
  /** set the presentation readonly */
  setReadonly: (bol: boolean) => void;
  /** Moves the camera through the API, regardless of whether scrollbars are shown. */
  moveCamera: (camera: { centerX: number, centerY: number, scale: number }) => void;
  /** get the origin scale */
  getOriginScale: () => number;
  /** get the view scale */
  getScale: () =>number;
  /** get the page size */
  getPageSize: () => { width: number, height: number };
  /** screenshot the current page */
  screenshotCurrentPageAsync: (context: CanvasRenderingContext2D, width?: number, height?: number) => Promise<void>;
}

const ppt2page = (ppt: SceneDefinition["ppt"], name?: string): PresentationPage | null =>
  ppt ? { width: ppt.width, height: ppt.height, src: ppt.src, thumbnail: ppt.previewURL, name } : null

const createLogger = (room: Room | undefined): Logger => {
  if (room && (room as any).logger) {
    return (...args) => (room as any).logger.info(...args)
  } else {
    return (...args) => console.log(...args)
  }
}

const createDiagnosticLogger = (context: AppContext): PresentationDiagnosticLogger => {
  const createAppLogger = (context as any).createLogger
  if (typeof createAppLogger === 'function') {
    return createAppLogger.call(context, 'camera', { debounceTime: 300, maxWaitTime: 2000 })
  }

  // Compatibility fallback for WindowManager versions without AppContext.createLogger().
  const roomLogger = (context.getRoom() as any)?.logger
  const prefix = `[Presentation][${context.appId}][camera]`
  const emit = (level: 'info' | 'warn' | 'error', event: string, ...data: unknown[]) => {
    try {
      const printer = roomLogger?.[level]
      if (typeof printer === 'function') printer.call(roomLogger, `${prefix}[${event}]`, ...data)
    } catch {
      // Diagnostics must never change the App API result or replace its original error.
    }
  }
  const debouncedByEvent = new Map<string, ReturnType<typeof debounce>>()
  const debouncedInfo = (event: string, payload?: unknown) => {
    let emitDebounced = debouncedByEvent.get(event)
    if (!emitDebounced) {
      emitDebounced = debounce(
        (nextPayload?: unknown) => emit('info', event, nextPayload),
        300,
        { maxWait: 2000 }
      )
      debouncedByEvent.set(event, emitDebounced)
    }
    emitDebounced(payload)
  }
  return {
    info: (event, payload) => emit('info', event, payload),
    warn: (event, payload) => emit('warn', event, payload),
    error: (event, error, payload) => emit('error', event, error, payload),
    debouncedInfo,
    flush: () => debouncedByEvent.forEach(logger => logger.flush()),
  }
}

const safeResourceLocation = (value: string): string => {
  if (value.startsWith('data:')) return 'data:[omitted]'
  if (value.startsWith('blob:')) return 'blob:[omitted]'
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0]
  }
}
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

export const NetlessAppPresentation: NetlessApp<PresentationAttributes, {}, PresentationAppOptions, PresentationController> = {
  kind: "Presentation",
  setup(context) {
    const diagnosticLogger = createDiagnosticLogger(context)
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
    const room = context.getRoom()
    const log = options.log || createLogger(room)
    const roomLogger = (room as any)?.logger
    const warn: Logger = (...data) => roomLogger?.warn ? roomLogger.warn(...data) : log(...data)
    const configuredOriginSize = context.storage.state.originSize
    const originSize = isValidSize(configuredOriginSize)
      ? { width: configuredOriginSize.width, height: configuredOriginSize.height }
      : undefined
    if (configuredOriginSize != null && !originSize) {
      warn(`[Presentation] originSize should contain finite positive width and height, got ${JSON.stringify(configuredOriginSize)}`)
    }
    let maxCameraScale = options.maxCameraScale ?? 3
    if (!(Number.isFinite(maxCameraScale) && maxCameraScale! > 0)) {
      warn(`[Presentation] maxCameraScale should be a positive number, got ${options.maxCameraScale}`)
      maxCameraScale = 3
    }

    log(`[Presentation] new ${context.appId}`)

    const dispose = disposableStore()
    dispose.add(() => log(`[Presentation] dispose ${context.appId}`))
    dispose.add(() => diagnosticLogger.flush())

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

    // let lastIndex = -1

    const me = context.getRoom()?.uid || context.getDisplayer().observerId + ''

    let throttleSyncView = 0

    const syncPage = async (index: number, logger?: any): Promise<boolean> => {

      if (!context.getIsWritable()) return false

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) return false

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
      return true
    }

    const prepareScenes = async (): Promise<void> => {
      if (!context.isAddApp) return
      // Caution: some user may insert a 500-page PDF.
      if (pages.length > 100)
        warn(`[Presentation]: too many pages (${pages.length}), may cause performance issues`)
      if (!room || !room.isWritable) return
      if (pageIndex$.value < 0 || pageIndex$.value >= pages.length) {
        throw new Error(`[Presentation] Invalid page index: ${pageIndex$.value}, scenes length: ${pages.length}`)
      }

      const scenes = room.entireScenes()[scenePath]
      if (!scenes || !scenes[pageIndex$.value]) {
        throw new Error(`[Presentation]: no initial scene found at ${scenePath}, page index: ${pageIndex$.value}`)
      }
      const { name, ppt } = scenes[pageIndex$.value]
      const nextScenes = pages.map((page, index) => ({
        name: page.name ?? String(index + 1),
        ppt: { width: page.width, height: page.height, src: page.src }
      }))

      if (!scenesEqual(scenes, nextScenes)) {
        room.removeScenes(scenePath)
        room.putScenes(scenePath, nextScenes)
      }

      const shouldRedirect = name === nextScenes[pageIndex$.value].name && !ppt
      if (shouldRedirect) {
        await context.addPage({ scene: { name: emptySceneName } })
        log(`[Presentation] setup setScenePath ${scenePath}/${emptySceneName}`)
        await context.setScenePath(`${scenePath}/${emptySceneName}`)
      }

      await syncPage(pageIndex$.value, (room as any).logger)
      if (shouldRedirect) {
        log(`[Presentation] setup removeScenes ${scenePath}/${emptySceneName}`)
        room.removeScenes(`${scenePath}/${emptySceneName}`)
      }
    }

    const prepareScenesPromise = prepareScenes()

    const canJumpPage = (index: number): boolean => {
      if (!context.getIsWritable()) {
        warn('[Presentation]: no permission, make sure you have test room.isWritable')
        return false
      }

      if (!(0 <= index && index < pages.length)) {
        warn(`[Presentation]: page ${index + 1} out of bounds [1, ${pages.length}]`)
        return false
      }

      const scenes = context.getDisplayer().entireScenes()[scenePath]
      if (!scenes) {
        warn(`[Presentation]: no scenes found at ${scenePath}, make sure you have added options.scenePath in addApp()`)
        return false
      }

      return true
    }

    const jumpPage = (index: number): boolean => {
      if (!canJumpPage(index)) return false

      void syncPage(index).catch(error => {
        warn('[Presentation]: failed to sync page', error)
        diagnosticLogger.error('jumpPage.failed', error, {
          index,
          pageIndex: pageIndex$.value,
          focusScenePath: view.focusScenePath,
        })
      })
      return true
    }

    const prevPage = () => jumpPage(pageIndex$.value - 1)
    const nextPage = () => jumpPage(pageIndex$.value + 1)
    const jumpPageAsync = async (index: number): Promise<boolean> => {
      if (!canJumpPage(index)) return false
      try {
        return await syncPage(index)
      } catch (error) {
        diagnosticLogger.error('jumpPageAsync.failed', error, {
          index,
          pageIndex: pageIndex$.value,
          focusScenePath: view.focusScenePath,
        })
        throw error
      }
    }
    const prevPageAsync = () => jumpPageAsync(pageIndex$.value - 1)
    const nextPageAsync = () => jumpPageAsync(pageIndex$.value + 1)
    const pageState = () => ({ index: pageIndex$.value, length: pages.length })

    const scaleDocsToFit = () => {
      const page = app.page()
      if (page && isValidSize(page)) {
        const referenceSize = getCameraReferenceSize(originSize, page)
        if (originSize) {
          const fitScale = getFitScale(view.size, referenceSize)
          if (!fitScale) return
          const { minScale, maxScale } = getCameraScaleRange(
            fitScale,
            maxCameraScale,
            options.disableCameraTransform
          )
          view.setCameraBound({
            damping: 1,
            maxContentMode: () => maxScale,
            minContentMode: () => minScale,
            centerX: 0, centerY: 0, width: page.width, height: page.height
          })
        }
        view.moveCameraToContain({
          originX: -referenceSize.width / 2,
          originY: -referenceSize.height / 2,
          width: referenceSize.width,
          height: referenceSize.height,
          animationMode: 'immediately' as AnimationMode.Immediately
        })
        if (!originSize) {
          const { minScale, maxScale } = getCameraScaleRange(
            view.camera.scale,
            maxCameraScale,
            options.disableCameraTransform
          )
          view.setCameraBound({
            damping: 1,
            maxContentMode: () => maxScale,
            minContentMode: () => minScale,
            centerX: 0, centerY: 0, width: page.width, height: page.height
          })
        }
        syncViewFromRemote(true)
      }
    }
    let pendingMoveCameraRequest: MoveCameraRequest | undefined
    const syncView = () => {
      if (context.getIsWritable()) {
        if (options.debounceSync) {
          clearTimeout(throttleSyncView);
          throttleSyncView = 0;
        }
        if (throttleSyncView > 0) return
        const page = app.page()
        if (page && isValidSize(page)) {
          throttleSyncView = setTimeout(() => {
            throttleSyncView = 0
            try {
              const { camera, size } = view;
              const referenceSize = getCameraReferenceSize(originSize, page)
              const viewport = cameraToSharedViewport(camera, size, referenceSize)
              if (viewport) view$$.setState({ uid: me, ...viewport })
              if (pendingMoveCameraRequest) {
                diagnosticLogger.debouncedInfo(
                  'moveCamera',
                  getCameraDiagnosticState('moveCamera', pendingMoveCameraRequest)
                )
                pendingMoveCameraRequest = undefined
              }
            } catch (error) {
              diagnosticLogger.error(
                'syncView.failed',
                error,
                getCameraDiagnosticState('moveCamera', pendingMoveCameraRequest)
              )
              pendingMoveCameraRequest = undefined
            }
          }, 50)
        }
      }
    }

    dispose.add(() => {
      clearTimeout(throttleSyncView)
      throttleSyncView = 0
      pendingMoveCameraRequest = undefined
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

    const getPageSize = () => {
      const { width, height } = app.page() || {}
      return { width: width || 0, height: height || 0 }
    }

    const box = context.getBox()
    const app = dispose.add(createPresentation(box, pages, jumpPage, pageIndex$, view, options.thumbnail, options.useClipView))
    app.contentDOM.dataset.appPresentationVersion = __VERSION__
    app.scaleDocsToFit = scaleDocsToFit
    app.log = log
    app.warn = warn

    const getCameraDiagnosticState = (
      reason: 'initialize' | 'moveCamera',
      requestedCamera?: MoveCameraRequest
    ) => {
      const page = app.page()
      const pageSize = page && isValidSize(page)
        ? { width: page.width, height: page.height }
        : undefined
      const referenceSize = pageSize
        ? getCameraReferenceSize(originSize, pageSize)
        : undefined
      const viewSize = { width: view.size.width, height: view.size.height }
      const viewCamera = {
        centerX: view.camera.centerX,
        centerY: view.camera.centerY,
        scale: view.camera.scale,
      }
      const sharedViewport = { ...view$$.state }
      const originScale = referenceSize ? getFitScale(viewSize, referenceSize) : undefined
      const normalizedScale = originScale && originScale > 0
        ? viewCamera.scale / originScale
        : undefined
      const sharedScaleX = referenceSize && sharedViewport.width > 0
        ? referenceSize.width / sharedViewport.width
        : undefined
      const sharedScaleY = referenceSize && sharedViewport.height > 0
        ? referenceSize.height / sharedViewport.height
        : undefined

      return {
        reason,
        requestedCamera,
        storageOriginSize: context.storage.state.originSize,
        sharedViewport,
        pageSize,
        referenceSize,
        viewSize,
        viewCamera,
        originScale,
        normalizedScale,
        sharedScaleX,
        sharedScaleY,
        focusScenePath: view.focusScenePath,
        isWritable: context.getIsWritable(),
      }
    }

    let didReportInitializedCamera = false
    const reportInitializedCamera = (source: 'setup' | 'onSizeUpdated') => {
      if (didReportInitializedCamera || !isValidSize(view.size) || !isValidSize(app.page())) return
      didReportInitializedCamera = true
      diagnosticLogger.info('initialize', {
        source,
        ...getCameraDiagnosticState('initialize'),
      })
    }

    if (originSize) {
      let previousPageIndex = pageIndex$.value
      dispose.add(pageIndex$.subscribe(nextPageIndex => {
        if (nextPageIndex === previousPageIndex) return
        previousPageIndex = nextPageIndex
        scaleDocsToFit()
      }))
    }

    if (options.justDocsViewReadonly) {
      app.setDocsViewReadonly(true)
    }

    const goToPageByClick = () => {
      const currentApplianceName = context.getRoom()?.state?.memberState?.currentApplianceName ?? '';
      if (!app.readonly && currentApplianceName === 'clicker') {
        nextPage();
      }
    }

    if(room && options.goToPageByClick && app.whiteboardDOM) {
      dispose.make(() => {
        app.whiteboardDOM.addEventListener('click', goToPageByClick);
        return () => app.whiteboardDOM.removeEventListener('click', goToPageByClick);
      })
    }

    context.mountView(app.whiteboardDOM)
    if (shouldDisableDeviceCameraTransform(options)) {
      view.disableCameraTransform = true
    }
    scaleDocsToFit()
    dispose.make(() => {
      const onSizeUpdated = () => {
        scaleDocsToFit()
        reportInitializedCamera('onSizeUpdated')
      }
      view.callbacks.on('onSizeUpdated', onSizeUpdated)
      return () => view.callbacks.off('onSizeUpdated', onSizeUpdated)
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
    reportInitializedCamera('setup')

    dispose.add(context.emitter.on("writableChange", (isWritable: boolean): void => {
      app.setReadonly(!isWritable)
    }))

    const getOriginScale = () => {
      const page = app.page()
      if (!page || !isValidSize(page)) return 0
      return getFitScale(view.size, getCameraReferenceSize(originSize, page)) || 0
    }

    const getScale =() => {
      return view.camera.scale
    }

    const screenshotCurrentPage = async (_context: CanvasRenderingContext2D, _width?: number, _height?: number) => {
      const currentPage = pages[pageIndex$.value];
      if (!currentPage) {
        throw new Error('[Presentation]: current page not found')
      }
      const { width, height, src } = currentPage;

      const img = document.createElement('img')
      img.width = width;
      img.height = height;
      img.crossOrigin = 'Anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(
          `[Presentation]: failed to load screenshot page image: ${safeResourceLocation(src)}`
        ))
        img.src = src
      })
      _context.drawImage(img, 0, 0, width, height, 0, 0, _width || width, _height || height);
      const currentScenePath = view.focusScenePath;
      if (!currentScenePath) {
        throw new Error('[Presentation]: current scene path not found')
      }
      const windowManger = context.getWindowManager() as any;
      if (windowManger._appliancePlugin) {
        await windowManger._appliancePlugin.screenshotToCanvasAsync(_context, currentScenePath, _width || width, _height || height, {
          centerX: 0,
          centerY: 0,
          scale: _width && _height ? Math.min(_width / width, _height / height) : 1,
        });
      } else {
        await view.screenshotToCanvasAsync(_context, currentScenePath, _width || width, _height || height, {
          centerX: 0,
          centerY: 0,
          scale: _width && _height ? Math.min(_width / width, _height / height) : 1,
        });
      }
    }

    const screenshotCurrentPageAsync = async (
      _context: CanvasRenderingContext2D,
      _width?: number,
      _height?: number
    ) => {
      try {
        await screenshotCurrentPage(_context, _width, _height)
      } catch (error) {
        diagnosticLogger.error('screenshotCurrentPage.failed', error, {
          pageIndex: pageIndex$.value,
          outputSize: { width: _width, height: _height },
          camera: getCameraDiagnosticState('initialize'),
        })
        throw error
      }
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

    const moveCamera = (camera: { centerX: number, centerY: number, scale: number }) => {
      try {
        if (!context.getIsWritable()) {
          throw new Error('[Presentation]: moveCamera must be called in writable room')
        }
        pendingMoveCameraRequest = { ...camera }
        if (scrollbar) {
          scrollbar.moveCamera(camera);
          return;
        }
        view.moveCamera({
          ...camera,
          animationMode: 'immediately' as AnimationMode.Immediately
        })
        syncView()
      } catch (error) {
        pendingMoveCameraRequest = undefined
        diagnosticLogger.error(
          'moveCamera.failed',
          error,
          getCameraDiagnosticState('moveCamera', camera)
        )
        throw error
      }
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
      if (!data.ok) {
        throw new Error(
          `[Presentation]: failed to fetch ${safeResourceLocation(url)}, status: ${data.status} ${data.statusText}`
        )
      }

      const blob = await data.blob()
      const reader = new FileReader()
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    }

    const toPdfInternal = async (): Promise<{ pdf: ArrayBuffer, title: string } | null> => {
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
      if (!scenes) {
        throw new Error(`[Presentation]: no scenes found while exporting PDF: ${scenePath}`)
      }

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
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(
            `[Presentation]: failed to load PDF page image, page index: ${index}`
          ))
          img.src = url
        })
        stage.drawImage(img, 0, 0)

        wb.clearRect(0, 0, pdfWidth, pdfHeight)
        const name = p.name ?? String(index + 1)
        if (scenes.some(scene => scene.name == name)) {
          const camera = { centerX: 0, centerY: 0, scale: Math.min(wb_canvas.width / width, wb_canvas.height / height) };
          const sPath = `${scenePath}/${name}`;
          // appliancePlugin is a performance optimization for whiteboard;
          const windowManger = context.getWindowManager() as any;
          if (windowManger._appliancePlugin) {
            await (windowManger as any)._appliancePlugin.screenshotToCanvasAsync(wb, sPath, wb_canvas.width, wb_canvas.height, camera);
          } else {
            await view.screenshotToCanvasAsync(
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
            warn(err)
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

    const toPdf = async (): Promise<{ pdf: ArrayBuffer, title: string } | null> => {
      try {
        return await toPdfInternal()
      } catch (error) {
        diagnosticLogger.error('toPdf.failed', error, {
          pageIndex: pageIndex$.value,
          pageCount: pages.length,
          focusScenePath: view.focusScenePath,
        })
        throw error
      }
    }

    dispose.add(listen(window, 'message', (ev: MessageEvent<{ appId: string, type: "@netless/_request_save_pdf_" }>) => {
      if (ev.data && ev.data.type == '@netless/_request_save_pdf_' && ev.data.appId == context.appId) {
        toPdf().catch(err => { warn(err); reportProgress(100, null) })
      }
    }))

    const setDocsViewReadonly = (bol: boolean) => {
      app.setDocsViewReadonly(bol)
    }

    const setReadonly = (bol: boolean) => {
      app.setReadonly(bol)
      if (options.goToPageByClick) {

      }
      if(scrollbar) {
        scrollbar.setReadonly(bol)
      }
    }

    const controller: PresentationController = { app, view, context, jumpPage, prevPage, nextPage, jumpPageAsync, prevPageAsync, nextPageAsync, pageState, toPdf, log, setDocsViewReadonly, setReadonly, moveCamera, getOriginScale, getScale, getPageSize, screenshotCurrentPageAsync }

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

    // Older WindowManager declarations model setup as synchronous even though
    // AppProxy awaits its result. Keep that source compatibility until the new
    // `SetupResult | Promise<SetupResult>` declaration is the minimum version.
    return prepareScenesPromise.then(() => controller) as unknown as PresentationController
  }
}

/**
 * Add synchronization to the local presentation.
 */
class AppPresentation extends Presentation {
  log?: Logger;
  warn?: Logger;
  box?: ReadonlyTeleBox;
  scaleDocsToFit?: () => void;
  readonly jumpPage: (index: number) => void

  constructor(config: PresentationConfig & { jumpPage: (index: number) => void }) {
    super(config)
    this.jumpPage = config.jumpPage
    // this.image.style.display = 'none'
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
      this.warn?.(`[Presentation]: page index ${index} out of bounds [0, ${this.pages.length - 1}]`)
    }
  }
}

function createPresentation(
  box: ReadonlyTeleBox,
  pages: PresentationPage[],
  jumpPage: (index: number) => void,
  pageIndex$: Readable<number>,
  view: View,
  thumbnail?: (src: string) => string,
  useClipView?: boolean,
): AppPresentation {
  box.mountStyles(styles)

  const app = new AppPresentation({ pages, readonly: box.readonly, jumpPage, thumbnail})
  app.box = box
  box.mountContent(app.contentDOM)
  box.mountFooter(app.footerDOM)

  app.dispose.add(pageIndex$.subscribe(pageIndex => { app.setPageIndex(pageIndex) }))

  if(useClipView && view){
    const onCameraUpdatedEffectForMaskView = debounce(() => {
      const { width: pageWidth, height: pageHeight } = app.page() || {};
      if(!pageWidth || !pageHeight) {
        return;
      }
      const { scale } = view.camera;
      const { width, height } = view.size;
      const pageRatioX = Math.round((1 - (pageWidth * scale / width)) / 2 * 100);
      const pageRatioY = Math.round((1 - (pageHeight * scale / height)) / 2 * 100);
      app.whiteboardDOM.style.clipPath = `inset(${pageRatioY}% ${pageRatioX}%)`;
    }, 50)
    onCameraUpdatedEffectForMaskView();
    const onCameraUpdatedEffect = () => {
      view.callbacks.on("onSizeUpdated", onCameraUpdatedEffectForMaskView)
      view.callbacks.on("onCameraUpdated", onCameraUpdatedEffectForMaskView)
      return () => {
        view.callbacks.off("onCameraUpdated", onCameraUpdatedEffectForMaskView);
        view.callbacks.off("onSizeUpdated", onCameraUpdatedEffectForMaskView);
      }
    }
    app.dispose.make(onCameraUpdatedEffect)
  }
  

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
