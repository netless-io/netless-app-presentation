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
        if (this.readonly) {
            this.destroy()
        } else {
            this.init();
        }
    }

    onCameraUpdated = debounce(() => {
        if (this.readonly) return;
        const { scale, centerX, centerY } = this.view.camera;
        const originScale = this.option.getOriginScale();
        const ratio = Math.round(originScale / scale * 1000) / 1000;
        const scrollX = Math.round(centerX * originScale);
        const scrollY = Math.round(centerY * originScale);
        if (this.scrollbarX) {
            this.scrollbarX.style.width = `${ratio * 100}%`;
            this.scrollbarX.style.display = ratio === 1 ? 'none' : 'block';
            this.scrollbarX.style.transform = `translateX(${scrollX}px)`;
        }
        if (this.scrollbarY) {
            this.scrollbarY.style.height = `${ratio * 100}%`;
            this.scrollbarY.style.display = ratio === 1 ? 'none' : 'block';
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
        const { width } = this.option.getPageSize();
        const originScale = this.option.getOriginScale();
        const scale = camera.scale;
        const ratio = Math.round(originScale / scale * 1000) / 1000;
        const scrollWidth = width * (1-ratio);
        const minX = -scrollWidth / 2;
        const maxX = scrollWidth / 2;
        return { minX, maxX };
    }

    getScrollYRange(camera: {scale: number}) {
        const { height } = this.option.getPageSize();
        const originScale = this.option.getOriginScale();
        const scale = camera.scale;
        const ratio = Math.round(originScale / scale * 1000) / 1000;
        const scrollHeight = height * (1-ratio);
        const minY = -scrollHeight / 2;
        const maxY = scrollHeight / 2;
        return { minY, maxY };
    }

    onDragX = (transformedDrag: {x: number, y: number}) => {
        if (this.cameraCache) {
            const {x} = transformedDrag;
            const originScale = this.option.getOriginScale();
            const { minX, maxX } = this.getScrollXRange(this.cameraCache);
            const scrollX = Math.round(x / originScale);
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
            const originScale = this.option.getOriginScale();
            const { minY, maxY } = this.getScrollYRange(this.cameraCache);
            const scrollY = Math.round(y / originScale);
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
        this.scrollbarX?.remove();
        this.scrollbarY?.remove();
        this.scrollbarX = undefined;
        this.scrollbarY = undefined;

        this.draggableX?.destroy();
        this.draggableY?.destroy();
        this.draggableX = undefined;
        this.draggableY = undefined;
    }

}