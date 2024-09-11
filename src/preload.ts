import type { IDisposable } from "@wopjs/disposable";
import type { PresentationPage } from "./presentation";

export enum ELoadState {
  unloaded,
  loading,
  loaded,
  error
}

export interface IPreloadMapValue {
  src: string
  state: ELoadState
}

export class Preload implements IDisposable {
  static maxLinks: number = 5;
  readonly loadingLinks: Map<number, HTMLLinkElement> = new Map();
  readonly preloadMap = new Map<number, IPreloadMapValue>();
  readonly waitingLoadSet: Set<number> = new Set();
  readonly waitinglinks: number[] = [];
  touchIndex: number = 0;
  preloadSize: number = 0;
  constructor(readonly pages: PresentationPage[]) {
    this.preloadMap = new Map(pages.map((e,index) => [index, {
      src: e.src,
      state: ELoadState.unloaded
    }]));
    this.waitingLoadSet = new Set(pages.map((e,index) => index));
    this.preloadSize = this.preloadMap.size;
    this.touch(0);
  }
  async touch(index: number): Promise<ELoadState> {
    this.touchIndex = index;
    const value = this.preloadMap.get(index);
    let state = ELoadState.unloaded;
    if (value) {
      state = value.state;
      if (value.state === ELoadState.unloaded) {
        if (this.loadingLinks.size) {
          for (const [i,link] of this.loadingLinks) {
            this.destroyLink(i, link);
            this.waitingLoadSet.add(i);
            const v = this.preloadMap.get(i);
            if (v) {
              v.state = ELoadState.unloaded;
              this.preloadMap.set(i, v);
            }
          }
          for (const i of this.waitinglinks) {
            this.waitingLoadSet.add(i);
          }
          this.waitinglinks.length = 0;
        }
        if (this.waitinglinks.includes(index)) {
          this.waitinglinks.splice(this.waitinglinks.indexOf(index), 1);
        }
        state = await new Promise<ELoadState>(resolve => {
          this.waitingLoadSet.delete(index);
          this.createLink(index, resolve);
        })
      }
    }
    if (this.waitingLoadSet.size) {
      this.requestAsyncCallBack(()=>{
        this.autoTouch();
      }, 1000)
    }
    return state;
  }
  private autoTouch(){
    this.handler();
    if (this.waitingLoadSet.size === 0) {
      return;
    }
    let nextTouchDelay = 1000;
    this.touchIndex = (this.touchIndex + 1) % this.preloadSize;
    const value = this.preloadMap.get(this.touchIndex);
    if (value) {
      switch (value.state) {
        case ELoadState.unloaded:
        case ELoadState.error:
          if (!this.waitinglinks.includes(this.touchIndex)) {
            this.waitinglinks.push(this.touchIndex);
            this.waitingLoadSet.delete(this.touchIndex);
          }
          nextTouchDelay = 0;
          break;
      }
    }
    this.requestAsyncCallBack(()=>{
      this.autoTouch();
    }, nextTouchDelay)
  }

  private createLink(index: number, resolve?:(state:ELoadState)=>void) {
    const value = this.preloadMap.get(index);
    if (value) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = value.src;
      link.dataset.order = index + '';
      document.head.appendChild(link);
      link.onload = () => {
        value.state = ELoadState.loaded;
        this.preloadMap.set(index, value);
        document.head.contains(link) && document.head.removeChild(link);
        this.loadingLinks.delete(index);
        resolve && resolve(ELoadState.loaded);
        this.autoTouch();
      }
      link.onerror = () => {
        value.state = ELoadState.error;
        this.preloadMap.set(index, value);
        if (!this.waitinglinks.includes(index)) {
          this.waitinglinks.push(index);
          this.waitingLoadSet.delete(this.touchIndex);
        }
        document.head.contains(link) && document.head.removeChild(link);
        this.loadingLinks.delete(index);
        resolve && resolve(ELoadState.error);
        this.autoTouch();
      }
      this.loadingLinks.set(index, link);
      value.state = ELoadState.loading;
      this.preloadMap.set(index, value);
    }
  }
  private handler() {
    if(!this.waitinglinks.length) {
      return;
    }
    let i = this.loadingLinks.size;
    while (i < Preload.maxLinks) {
      const index = this.waitinglinks.shift();
      if (index !== undefined) {
        this.createLink(index);
      }
      i++;
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
  private destroyLink(index: number, link: HTMLLinkElement) {
    document.head.contains(link) && document.head.removeChild(link)
    this.loadingLinks.delete(index)
  }
  dispose() {
    for (const [index,link] of this.loadingLinks) {
      this.destroyLink(index, link);
    }
    this.preloadMap.clear();
    this.waitingLoadSet.clear();
    this.waitinglinks.length = 0;
  }
}
