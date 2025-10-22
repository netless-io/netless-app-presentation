import './style.scss?inline';
import type { View, AnimationMode } from "@netless/window-manager";
import { makeDraggable } from "./Draggable";
import { debounce } from 'lodash';

export interface ScrollbarOption {
    appId: string;
    readonly?: boolean;
    getPageSize: () => {
        width: number;
        height: number;
    };
    getWritable: () => boolean;
    getOriginScale: () => number;
    syncView: () => void;
    scrollbarEventCallback?: ScrollbarEventCallback;
}

export interface ScrollbarEventCallback {
    onScrollbarDragStart?: () => void;
    onScrollbarDragEnd?: () => void;
    onScrollbarDragX?: (x: number) => void;
    onScrollbarDragY?: (y: number) => void;
    onScrollCameraUpdated?: (appid: string, originScale: number, scale: number) => void;
}

export class Scrollbar {
    readonly namespace = "netless-app-presentation"
    readonly appId: string;
    private container: HTMLElement;
    private scrollContainer: HTMLDivElement = document.createElement('div');
    private option: ScrollbarOption = {
        appId: '',
        getPageSize: () => {
            return {
                width: 0,
                height: 0
            }
        },      
        getWritable: () => false,
        getOriginScale: () => 1,
        syncView: () => void 0
    };
    private view: View;
    private scrollbarContainerX?: HTMLDivElement;
    private scrollbarContainerY?: HTMLDivElement;
    private scrollbarX?: HTMLDivElement;
    private scrollbarY?: HTMLDivElement;
    private draggableX?: { destroy: () => void };
    private draggableY?: { destroy: () => void };
    private cameraCache?: {
        centerX: number;
        centerY: number;
        scale: number;
    };
    private readonly: boolean;
    constructor(container: HTMLElement, option: ScrollbarOption, view: View) {
        this.scrollContainer.className = this.c('scrollbar-container');
        this.container = container;
        this.option = option;
        this.appId = option.appId;
        this.readonly = option.readonly || false;
        this.view = view;
        this.init();
    }
    private c(className: string): string {
        return `${this.namespace}-${className}`
    }

    setReadonly(bol: boolean){
        this.readonly = bol;
        this.destroy()
        if (!this.readonly) {
            this.init();
        }
    }

    onCameraUpdated = debounce(() => {
        if (this.readonly) return;
        const { scale, centerX, centerY } = this.view.camera;
        const originScale = this.option.getOriginScale();
        const { width: pageWidth, height: pageHeight } = this.option.getPageSize();
        const { width: viewWidth, height: viewHeight } = this.view.size;
        const originScaleX = viewWidth / pageWidth;
        const originScaleY = viewHeight / pageHeight;
        const ratioX = Math.min(Math.round(originScaleX / scale * 100) / 100, 1);
        const ratioY = Math.min(Math.round(originScaleY / scale * 100) / 100, 1);
        const scrollX = Math.round(centerX * originScaleX);
        const scrollY = Math.round(centerY * originScaleY);
        if (this.scrollbarX) {
            this.scrollbarX.style.width = `${ratioX * 100}%`;
            this.scrollbarX.style.display = ratioX === 1 ? 'none' : 'block';
            this.scrollbarX.style.transform = `translateX(${scrollX}px)`;
        }
        if (this.scrollbarY) {
            this.scrollbarY.style.height = `${ratioY * 100}%`;
            this.scrollbarY.style.display = ratioY === 1 ? 'none' : 'block';
            this.scrollbarY.style.transform = `translateY(${scrollY}px)`;
        }
        this.option.scrollbarEventCallback?.onScrollCameraUpdated?.(this.appId, originScale, scale);
    }, 50)

    onDragStart = () => {
        const camera = this.view.camera;
        this.cameraCache = {
            centerX: camera.centerX,
            centerY: camera.centerY,
            scale: camera.scale,
        }
        this.option.scrollbarEventCallback?.onScrollbarDragStart?.();
    }

    getScrollXRange(camera: {scale: number}) {
        const { width: pageWidth } = this.option.getPageSize();
        const { width: viewWidth } = this.view.size;
        const originScaleX = viewWidth / pageWidth;
        // const originScale = this.option.getOriginScale();
        const scale = camera.scale;
        const ratio = Math.min(Math.round(originScaleX / scale * 100) / 100, 1);
        const scrollWidth = pageWidth * (1-ratio);
        const minX = -scrollWidth / 2;
        const maxX = scrollWidth / 2;
        return { minX, maxX };
    }

    getScrollYRange(camera: {scale: number}) {
        const { height: pageHeight } = this.option.getPageSize();
        const { height: viewHeight } = this.view.size;
        const originScaleY = viewHeight / pageHeight;
        // const originScale = this.option.getOriginScale();
        const scale = camera.scale;
        const ratio = Math.min(Math.round(originScaleY / scale * 100) / 100, 1);
        const scrollHeight = pageHeight * (1-ratio);
        const minY = -scrollHeight / 2;
        const maxY = scrollHeight / 2;
        return { minY, maxY };
    }

    onDragX = (transformedDrag: {x: number, y: number}) => {
        if (this.cameraCache) {
            const {x} = transformedDrag;
            // const originScale = this.option.getOriginScale();
            const { width: pageWidth } = this.option.getPageSize();
            const { width: viewWidth } = this.view.size;
            const originScaleX = viewWidth / pageWidth;
            const { minX, maxX } = this.getScrollXRange(this.cameraCache);
            const scrollX =Math.round(x / originScaleX);
            let centerX = scrollX + this.cameraCache.centerX;
            if (centerX < minX) {
                centerX = minX;
            } else if (centerX > maxX) {
                centerX = maxX;
            }
            this.view.moveCamera({
                centerX,
                animationMode: 'immediately' as AnimationMode
            })
            this.option.scrollbarEventCallback?.onScrollbarDragY?.(centerX);
        }
    }

    onDragY = (transformedDrag: {x: number, y: number}) => {
        if(this.cameraCache){
            const {y} = transformedDrag;
            // const originScale = this.option.getOriginScale();
            const { height: pageHeight } = this.option.getPageSize();
            const { height: viewHeight } = this.view.size;
            const originScaleY = viewHeight / pageHeight;
            const { minY, maxY } = this.getScrollYRange(this.cameraCache);
            const scrollY = Math.round(y / originScaleY);
            let centerY = scrollY + this.cameraCache.centerY;
            if (centerY < minY) {
                centerY = minY;
            } else if (centerY > maxY) {
                centerY = maxY;
            }
            this.view.moveCamera({
                centerY,
                animationMode: 'immediately' as AnimationMode
            })
            this.option.scrollbarEventCallback?.onScrollbarDragY?.(centerY);
        }
    }

    onDragEnd = () => {
        this.cameraCache = undefined
        this.option.syncView();
        this.option.scrollbarEventCallback?.onScrollbarDragEnd?.();
    }

    private init() {
        this.scrollbarX = document.createElement('div');
        this.scrollbarX.classList.add(this.c('scrollbar-x'));
        if (this.option.getWritable()) {
            this.draggableX = makeDraggable(this.scrollbarX, {
                direction: 'x',
                onDrag: this.onDragX,
                onDragEnd: this.onDragEnd,
                onDragStart: this.onDragStart,
            })
        }
        Object.assign(this.scrollbarX.style, {
            width: '100%',
            display: 'none'
        });
        this.scrollbarContainerX = document.createElement('div');
        this.scrollbarContainerX.classList.add(this.c('scrollbar-container-x'));
        this.scrollbarContainerX.appendChild(this.scrollbarX);

        this.scrollbarY = document.createElement('div');
        this.scrollbarY.classList.add(this.c('scrollbar-y'));
        if (this.option.getWritable()) {
            this.draggableY = makeDraggable(this.scrollbarY, {
                direction: 'y',
                onDrag: this.onDragY,
                onDragEnd: this.onDragEnd,
                onDragStart: this.onDragStart,
            })
        }
        Object.assign(this.scrollbarY.style, {
            height: '100%',
            display: 'none'
        });
        this.scrollbarContainerY = document.createElement('div');
        this.scrollbarContainerY.classList.add(this.c('scrollbar-container-y'));
        this.scrollbarContainerY.appendChild(this.scrollbarY);

        this.scrollContainer.append(this.scrollbarContainerX, this.scrollbarContainerY);
        this.container.appendChild(this.scrollContainer);
        this.view.callbacks.on('onCameraUpdated', this.onCameraUpdated);
        this.onCameraUpdated();
    }

    destroy() {
        this.view.callbacks.off('onCameraUpdated', this.onCameraUpdated);
        if (this.scrollbarX && this.scrollbarContainerX) {
            this.scrollbarContainerX.removeChild(this.scrollbarX);
            this.scrollbarX.remove();
            this.scrollbarContainerX.remove();
            this.scrollbarX = undefined;
        }
        if (this.scrollbarY && this.scrollbarContainerY) {
            this.scrollbarContainerY.removeChild(this.scrollbarY);
            this.scrollbarY.remove();
            this.scrollbarContainerY.remove();
            this.scrollbarY = undefined;
        }
        if (this.draggableX) {
            this.draggableX.destroy();
            this.draggableX = undefined;
        }
        if (this.draggableY) {
            this.draggableY.destroy();
            this.draggableY = undefined;
        }

    }

}