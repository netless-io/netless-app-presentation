import type { NetlessApp } from "@netless/window-manager"

import styles from './style.scss'

export interface SlideshowPage {
  src: string;
  height: number;
  width: number;
  thumbnail: string | undefined;
}

export const NetlessAppSlideshow: NetlessApp = {
  kind: "Slideshow",
  setup(context) {
    const scenes = context.getScenes()
    if (!scenes) {
      throw new Error("[Slideshow]: scenes not found, make sure you have add options.scenes in addApp()")
    }

    const view = context.getView()
    if (!view) {
      throw new Error("[Slideshow]: no whiteboard view, make sure you have add options.scenePath in addApp()")
    }

    const pages = scenes.map(({ ppt }) => ppt ? { width: ppt.width, height: ppt.height, src: ppt.src, thumbnail: ppt.previewURL } : null)
                        .filter((page): page is SlideshowPage => Boolean(page))
    if (pages.length === 0) {
      throw new Error("[Slideshow]: empty scenes, make sure you have add options.scenes in addApp()")
    }

    if (pages[0].src.startsWith('ppt')) {
      throw new Error("[Slideshow]: legacy dynamic PPT is unsupported")
    }

    const box = context.getBox()
    box.mountStyles(styles)

  }
}
