import type { IDisposable } from "@wopjs/disposable";
import type { PresentationPage } from "./presentation";

export class Preload implements IDisposable {
  readonly links: HTMLLinkElement[]

  head = 0
  tail = 0
  timer = 0
  count = 0

  get done(): boolean {
    return this.head == 0 && this.tail == this.pages.length
  }

  constructor(readonly pages: PresentationPage[]) {
    this.links = new Array(pages.length)
    this.touch(0)
  }

  touch(index: number) {
    if (this.done) return
    this.head = this.tail = index
    this.timer ||= setTimeout(this.handler.bind(this))
  }

  handler() {
    const { links } = this

    while (this.head > 0 && links[this.head]) this.head--
    if (!links[this.head]) {
      const link = document.createElement('link')
      links[this.head] = link
      link.rel = 'preload'
      link.as = 'image'
      link.href = this.pages[this.head].src
      link.dataset.order = this.count + ''
      document.head.appendChild(link)
      this.count++
    }

    while (links[this.tail]) this.tail++
    if (this.tail < this.pages.length && !links[this.tail]) {
      const link = document.createElement('link')
      links[this.tail] = link
      link.rel = 'preload'
      link.as = 'image'
      link.href = this.pages[this.tail].src
      link.dataset.order = this.count + ''
      document.head.appendChild(link)
      this.count++
    }

    this.timer = setTimeout(this.handler.bind(this), 2_000)
    this.count++

    if (this.count >= 10) for (const link of this.links)
      if (link && link.dataset.order && +link.dataset.order < this.count - 10)
        document.head.contains(link) && document.head.removeChild(link)
  }

  dispose() {
    clearTimeout(this.timer)
    for (const link of this.links)
      link && document.head.contains(link) && document.head.removeChild(link)
    this.links.length = 0
  }
}
