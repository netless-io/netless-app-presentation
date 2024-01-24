import type { IDisposable } from '@wopjs/disposable'
import type { PresentationPage } from "./app-presentation";

import { disposableStore } from '@wopjs/disposable'
import { listen } from '@wopjs/dom'
import { default as LazyLoad, type ILazyLoadInstance } from 'vanilla-lazyload'
import { arrowLeftSVG, arrowRightSVG, sidebarSVG } from './icons';

export interface PresentationConfig {
  readonly pages: PresentationPage[]
  readonly readonly?: boolean
}

/**
 * Standalone presentation slide viewer.
 *
 * ```html
 * <div class="netless-app-presentation">
 *   <div class="netless-app-presentation-content netless-app-presentation-readonly">
 *     <div class="netless-app-presentation-preview-mask"></div>
 *     <div class="netless-app-presentation-preview">
 *       <a class="netless-app-presentation-preview-page">
 *         <img :data-src="thumbnail || src">
 *         <span class="netless-app-presentation-preview-page-name">1</span>
 *       </a>
 *     </div>
 *     <div class="netless-app-presentation-image">
 *       <img :src="src">
 *     </div>
 *     <div class="netless-app-presentation-wb-view" style="pointer-events: auto"></div>
 *   </div>
 *   <div class="netless-app-presentation-footer netless-app-presentation-readonly">
 *     <button class="netless-app-presentation-footer-btn netless-app-presentation-btn-sidebar">
 *       <svg class="netless-app-presentation-footer-icon-sidebar"></svg>
 *     </button>
 *     <div class="netless-app-presentation-page-jumps">
 *       <button-page-back />
 *       <button-page-next />
 *     </div>
 *     <div class="netless-app-presentation-page-number">
 *       <input class="netless-app-presentation-page-number-input">
 *       <span> / 10</span>
 *     </div>
 *   </div>
 * </div>
 * ```
 */
export class Presentation implements IDisposable<void> {
  readonly namespace = "netless-app-presentation"
  readonly dispose = disposableStore()
  readonly pages: PresentationPage[]

  dom: Element | DocumentFragment
  contentDOM: HTMLDivElement
  previewDOM: HTMLDivElement
  imageDOM: HTMLDivElement
  image: HTMLImageElement
  whiteboardDOM: HTMLDivElement
  footerDOM: HTMLDivElement
  pageNumberInputDOM: HTMLInputElement

  readonly: boolean
  initialized = false
  showPreview = false
  pageIndex = 0
  previewLazyload: ILazyLoadInstance | null = null

  constructor(config: PresentationConfig) {
    this.pages = config.pages
    this.readonly = config.readonly ?? false
    this.dom = document.createElement('div')
    this.dom.className = this.namespace
    this.contentDOM = document.createElement('div')
    this.contentDOM.className = this.c('content')
    this.previewDOM = document.createElement('div')
    this.previewDOM.className = this.c('preview')
    this.imageDOM = document.createElement('div')
    this.imageDOM.className = this.c('image')
    this.image = document.createElement('img')
    this.whiteboardDOM = document.createElement('div')
    this.whiteboardDOM.className = this.c('wb-view')
    this.footerDOM = document.createElement('div')
    this.footerDOM.className = this.c('footer')
    this.pageNumberInputDOM = document.createElement('input')
    this.pageNumberInputDOM.className = this.c('page-number-input')
    this.initialize()
  }

  initialize() {
    if (this.initialized) return
    this.initialized = true

    this.dispose.add(() => this.previewLazyload?.destroy())

    this.contentDOM.classList.toggle(this.c('readonly'), this.readonly)
    this.dom.appendChild(this.contentDOM)

    const previewMask = this.contentDOM.appendChild(document.createElement('div'))
    previewMask.className = this.c('preview-mask')
    this.dispose.add(listen(previewMask, "click", ev => {
      if (this.readonly) return
      if (ev.target == previewMask) {
        this.togglePreview(false)
      }
    }))

    this.contentDOM.appendChild(this.previewDOM)
    this.previewDOM.classList.add("tele-fancy-scrollbar")
    const c_previewPage = this.c('preview-page')
    const c_previewPageName = this.c('preview-page-name')
    for (let index = 0; index < this.pages.length; ++index) {
      const page = this.pages[index]
      const previewSRC = page.thumbnail || this.x_oss_process(page.src)

      const previewPage = document.createElement('a')
      previewPage.className = `${c_previewPage} ${this.c(`preview-page-${index}`)}`
      previewPage.setAttribute('href', '#')
      previewPage.dataset.pageIndex = String(index)

      const img = document.createElement('img')
      img.width = page.width
      img.height = page.height
      img.dataset.src = previewSRC
      img.dataset.pageIndex = String(index)

      const name = document.createElement('span')
      name.className = c_previewPageName
      name.textContent = String(index + 1)
      name.dataset.pageIndex = String(index)

      previewPage.appendChild(img)
      previewPage.appendChild(name)
      this.previewDOM.appendChild(previewPage)
    }
    this.previewLazyload?.update()

    this.dispose.add(listen(this.previewDOM, "click", ev => {
      if (this.readonly) return
      const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex
      if (pageIndex) {
        ev.preventDefault()
        ev.stopPropagation()
        ev.stopImmediatePropagation()
        this.onNewPageIndex(Number(pageIndex), 'preview')
        this.togglePreview(false)
      }
    }))

    this.imageDOM.appendChild(this.image)
    this.contentDOM.appendChild(this.imageDOM)
    this.updateImage()

    this.contentDOM.appendChild(this.whiteboardDOM)

    this.footerDOM.classList.toggle(this.c('readonly'), this.readonly)
    this.dom.appendChild(this.footerDOM)

    const btnSidebar = document.createElement('button')
    btnSidebar.className = `${this.c('footer-btn')} ${this.c('btn-sidebar')}`
    btnSidebar.appendChild(sidebarSVG(this.namespace))
    this.footerDOM.appendChild(btnSidebar)
    this.dispose.add(listen(btnSidebar, "click", () => {
      if (this.readonly) return
      this.togglePreview()
    }))

    const pageJumps = document.createElement('div')
    pageJumps.className = this.c('page-jumps')
    this.footerDOM.appendChild(pageJumps)

    const btnPageBack = document.createElement('button')
    btnPageBack.className = `${this.c('footer-btn')} ${this.c('btn-page-back')}`
    btnPageBack.appendChild(arrowLeftSVG(this.namespace))
    pageJumps.appendChild(btnPageBack)
    this.dispose.add(listen(btnPageBack, "click", () => {
      if (this.readonly) return
      if (this.pageIndex > 0) this.onNewPageIndex(this.pageIndex - 1, 'navigation')
    }))

    const btnPageNext = document.createElement('button')
    btnPageNext.className = `${this.c('footer-btn')} ${this.c('btn-page-next')}`
    btnPageNext.appendChild(arrowRightSVG(this.namespace))
    pageJumps.appendChild(btnPageNext)
    this.dispose.add(listen(btnPageNext, "click", () => {
      if (this.readonly) return
      if (this.pageIndex < this.pages.length - 1) this.onNewPageIndex(this.pageIndex + 1, 'navigation')
    }))

    const pageNumber = document.createElement('div')
    pageNumber.className = this.c('page-number')
    this.footerDOM.appendChild(pageNumber)

    pageNumber.appendChild(this.pageNumberInputDOM)
    this.pageNumberInputDOM.value = String(this.pageIndex + 1)
    this.pageNumberInputDOM.disabled = this.readonly
    this.dispose.add(listen(this.pageNumberInputDOM, "focus", () => {
      if (this.readonly) return
      this.pageNumberInputDOM.select()
    }))
    this.dispose.add(listen(this.pageNumberInputDOM, "change", () => {
      if (this.readonly) return
      if (this.pageNumberInputDOM.value) {
        this.onNewPageIndex(Number(this.pageNumberInputDOM.value) - 1, 'input')
      }
    }))

    const totalPage = document.createElement('span')
    totalPage.textContent = ` / ${this.pages.length}`
    pageNumber.appendChild(totalPage)

    this.dispose.add(listen(window, "keydown", ev => {
      if (this.readonly || this.isEditable(ev.target)) return
      if ((ev.key == 'ArrowUp' || ev.key == 'ArrowLeft') && this.pageIndex > 0)
        this.onNewPageIndex(this.pageIndex - 1, 'keydown')
      else if ((ev.key == 'ArrowDown' || ev.key == 'ArrowRight') && this.pageIndex < this.pages.length - 1)
        this.onNewPageIndex(this.pageIndex + 1, 'keydown')
    }))
  }

  setDOM(dom: Element | DocumentFragment) {
    if (this.dom == dom) return
    dom.appendChild(this.contentDOM)
    dom.appendChild(this.footerDOM)
    this.dom = dom
  }

  setReadonly(readonly: boolean) {
    if (this.readonly == readonly) return
    this.contentDOM.classList.toggle(this.c('readonly'), readonly)
    this.footerDOM.classList.toggle(this.c('readonly'), readonly)
    this.pageNumberInputDOM.disabled = readonly
    this.readonly = readonly
  }

  setPageIndex(pageIndex: number) {
    if (Number.isSafeInteger(pageIndex)) {
      this.pageIndex = pageIndex
      this.pageNumberInputDOM.value = String(pageIndex + 1)
      this.updateImage()
    }
  }

  togglePreview(showPreview?: boolean) {
    this.showPreview = showPreview ?? !this.showPreview
    this.contentDOM.classList.toggle(this.c('preview-active'), this.showPreview)
    if (this.showPreview) {
      const previewPageDOM = this.previewDOM.querySelector<HTMLElement>('.' + this.c(`preview-page-${this.pageIndex}`))
      if (previewPageDOM) {
        this.previewLazyload ||= new LazyLoad({
          container: this.previewDOM,
          elements_selector: `.${this.c('preview-page>img')}`
        })
        this.previewDOM.scrollTo({ top: previewPageDOM.offsetTop - 16 })
      }
    }
  }

  // [origin] means the cause:
  // - navigation: user clicked on the left / right button on footer
  // - input: user filled the bottom-right page number input box
  // - preview: user clicked on the left preview menu's item
  // - keydown: this navigation is caused by user press left or right
  // Fastboard dispatchDocsEvent() triggers the "navigation" and "input" cause
  onNewPageIndex(index: number, _origin: "navigation" | "keydown" | "input" | "preview") {
    if (0 <= index && index < this.pages.length) {
      this.setPageIndex(index)
    }
  }

  page(): PresentationPage | undefined {
    return this.pages[this.pageIndex]
  }

  updateImage() {
    const page = this.pages[this.pageIndex]
    if (!page) {
      this.image.src = ''
      return
    }
    this.image.width = page.width
    this.image.height = page.height
    this.image.src = page.src
  }

  private c(className: string): string {
    return `${this.namespace}-${className}`
  }

  private isEditable(el: EventTarget | null): boolean {
    if (!el) return false
    const { tagName } = el as HTMLElement
    return tagName == 'INPUT' || tagName == 'TEXTAREA' || tagName == 'SELECT'
  }

  private x_oss_process(src: string): string {
    try {
      const url = new URL(src)
      url.searchParams.set('x-oss-process', 'image/resize,l_50')
      return url.toString()
    } catch (err) {
      console.error(err)
      return src
    }
  }
}
