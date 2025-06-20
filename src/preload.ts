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
  constructor(readonly pages: PresentationPage[]) {
    this.preloadMap = new Map(pages.map((e,index) => [index, {
      src: e.src,
      state: ELoadState.unloaded
    }]));
    this.preloadSize = this.preloadMap.size;
    this.touch(0, true);
  }
  touch(index: number, force: boolean = false) {
    if (index >= this.preloadSize) {
      this.touchIndex = 0;
    } else {
      this.touchIndex = index;
    }
    const value = this.preloadMap.get(this.touchIndex);
    if (value && value.state === ELoadState.unloaded) {
      this.createLink(this.touchIndex, force);
    }
    if (this.loadingLinks.size < Preload.maxLinks) {
      const willLoad = [...this.preloadMap.entries()].find(([i, e]) => i > this.touchIndex && e.state !== ELoadState.loaded);
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
      document.head.appendChild(linkDom);
      linkDom.onload = () => {
        const value = this.preloadMap.get(index);
        if (value) {
          value.state = ELoadState.loaded;
          this.preloadMap.set(index, value);
          document.head.contains(linkDom) && document.head.removeChild(linkDom);
          this.loadingLinks.delete(index);
          this.touch(this.touchIndex + 1, false);
        }
      }
      linkDom.onerror = () => {
        const value = this.preloadMap.get(index);
        if (value?.src) {
          linkDom.href = value.src;
        }
      }
      this.loadingLinks.set(index, {
        link: linkDom,
        isForce: force
      });
      value.state = ELoadState.unloaded;
      this.preloadMap.set(index, value);
      return ELoadState.unloaded;
    }
    return ELoadState.error;
  }

  private destroySomeLink(excludeIndex?: number) {
    for (const [index, { link }] of this.loadingLinks) {
      if (excludeIndex !== undefined && index === excludeIndex) {
        continue;
      }
      document.head.contains(link) && document.head.removeChild(link);
      this.loadingLinks.delete(index);
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
    this.destroySomeLink();
    this.preloadMap.clear();
  }
}
