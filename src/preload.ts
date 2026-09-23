import type { IDisposable } from "@wopjs/disposable";
import type { PresentationPage } from "./presentation";

export type Subscriber<T> = (value: T) => void;
export type Unsubscriber = () => void;
export type Updater<T> = (value: T) => T;

export interface PageIndex<T> {
  readonly value: T;
  subscribe(this: void, run: Subscriber<T>): Unsubscriber;
  reaction(this: void, run: Subscriber<T>): Unsubscriber;
  dispose(value?: T): void;
}

export enum ELoadState {
  unloaded,
  loaded,
  error
}

export interface IPreloadMapValue {
  src: string
  state: ELoadState
}

export class Preload implements IDisposable {
  static maxLinks: number = 5;
  // 正在加载的链接
  readonly loadingLinks: Map<number, {
    link: HTMLLinkElement,
    isForce: boolean
  }> = new Map();
  // 需要预加载的链接集合
  readonly preloadMap = new Map<number, IPreloadMapValue>();
  // 当前触摸的索引
  touchIndex: number = 0;
  preloadSize: number = 0;
  // 暂停后不再创建预加载链接（app 失焦降级时调用）；已插入的 link 会被移除，
  // 挂起的 idle 回调重新进入 touch() 时也会被跳过
  paused: boolean = false;
  private disposed = false;
  constructor(readonly pages: PresentationPage[]) {
    this.preloadMap = new Map(pages.map((e,index) => [index, {
      src: e.src,
      state: ELoadState.unloaded
    }]));
    this.preloadSize = this.preloadMap.size;
    this.touch(0, true);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.destroySomeLink();
  }
  resume(index?: number) {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.touch(index ?? this.touchIndex, true);
  }
  touch(index: number, force: boolean = false) {
    if (this.paused || this.disposed) return;
    if (index >= this.preloadSize) {
      this.touchIndex = 0;
    } else {
      this.touchIndex = index;
    }
    const value = this.preloadMap.get(this.touchIndex);
    if (value && (value.state === ELoadState.unloaded || (force && value.state === ELoadState.error))) {
      this.createLink(this.touchIndex, force);
    }
    if (this.loadingLinks.size < Preload.maxLinks) {
      const willLoad = [...this.preloadMap.entries()].find(([i, e]) => i > this.touchIndex && e.state === ELoadState.unloaded);
      if (willLoad) {
        this.requestAsyncCallBack(()=>{this.touch(willLoad[0], false)}, 100);
      }
    }
  }

  private createLink(index: number, force: boolean = false):ELoadState {
    const value = this.preloadMap.get(index);
    if (force) { 
      this.destroySomeLink(index);
    }
    if (value) {
      if (value.state === ELoadState.loaded) {
        return ELoadState.loaded;
      }
      const curlink = this.loadingLinks.get(index);
      if (curlink) {
        if (curlink.isForce !== force) {
          curlink.isForce = force;
          this.loadingLinks.set(index, curlink);
        }
        return ELoadState.unloaded;
      }
      if (this.loadingLinks.size > Preload.maxLinks) {
        return ELoadState.unloaded;
      }
      const linkDom = document.createElement('link');
      linkDom.rel = 'preload';
      linkDom.as = 'image';
      linkDom.href = value.src;
      linkDom.dataset.order = index + '';
      linkDom.onload = () => {
        if (this.loadingLinks.get(index)?.link !== linkDom) return;
        const value = this.preloadMap.get(index);
        if (value) {
          value.state = ELoadState.loaded;
          this.preloadMap.set(index, value);
          this.removeLink(index, linkDom);
          this.touch(this.touchIndex + 1, false);
        }
      }
      linkDom.onerror = () => {
        if (this.loadingLinks.get(index)?.link !== linkDom) return;
        const value = this.preloadMap.get(index);
        if (value) {
          // Preloading is best effort. Do not retry in an error loop;
          // revisiting the page explicitly may retry after network recovery.
          value.state = ELoadState.error;
          this.removeLink(index, linkDom);
          this.touch(this.touchIndex + 1, false);
        }
      }
      this.loadingLinks.set(index, {
        link: linkDom,
        isForce: force
      });
      value.state = ELoadState.unloaded;
      this.preloadMap.set(index, value);
      document.head.appendChild(linkDom);
      return ELoadState.unloaded;
    }
    return ELoadState.error;
  }

  private removeLink(index: number, link: HTMLLinkElement) {
    link.onload = null;
    link.onerror = null;
    document.head.contains(link) && document.head.removeChild(link);
    this.loadingLinks.delete(index);
  }
  private destroySomeLink(excludeIndex?: number) {
    for (const [index, { link }] of this.loadingLinks) {
      if (excludeIndex !== undefined && index === excludeIndex) {
        continue;
      }
      this.removeLink(index, link);
    }
  }
  private async requestAsyncCallBack (callBack:()=>void, timeout:number):Promise<void> {
      await new Promise(function(resolve) {
        if ((window as any).requestIdleCallback) {
          requestIdleCallback(()=>{
            resolve(1);
          },{timeout})
        } else {
          setTimeout(()=>{
            resolve(2);
          }, timeout)
        }
      });
      callBack();
  }
  dispose() {
    this.disposed = true;
    this.destroySomeLink();
    this.preloadMap.clear();
  }
}
