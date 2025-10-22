/// <reference types="vite/client" />
import { register, createFastboard, createUI, dispatchDocsEvent } from '@netless/fastboard'
import { install, type PresentationController } from '../src'
import { data } from './example'
import fullWorkerString from '@netless/appliance-plugin/dist/fullWorker.js?raw';
import subWorkerString from '@netless/appliance-plugin/dist/subWorker.js?raw';

install(register, {
  as: 'DocsViewer',
  appOptions: {
    useScrollbar: true,
    debounceSync: true,
    maxCameraScale: 5,
    useClipView: true,
    scrollbarEventCallback: {
      onScrollCameraUpdated: (appid, originScale, scale) => {
        console.log('onScrollCameraUpdated===>', appid, originScale, scale, Math.round(scale / originScale  * 1000) /1000);
      }
    },
    thumbnail(src) {
      try {
        const url = new URL(src)
        // https://www.alibabacloud.com/help/en/oss/user-guide/resize-images-4
        url.searchParams.set('x-oss-process', 'image/resize,l_100')
        return url.toString()
      } catch (err) {
        console.error(err)
        return src
      }
    },
    // viewport(page) {
    //   // landscape
    //   if (page.width > page.height) {
    //     return { x: 0, y: 0, width: 1, height: 1 }
    //   }
    //   // portrait, show upper half
    //   else {
    //     return { x: 0, y: 0, width: 1, height: 0.5 }
    //   }
    // }
  }
})
globalThis.dispatchDocsEvent = dispatchDocsEvent
const fullWorkerBlob = new Blob([fullWorkerString], {type: 'text/javascript'});
const fullWorkerUrl = URL.createObjectURL(fullWorkerBlob);
const subWorkerBlob = new Blob([subWorkerString], {type: 'text/javascript'});
const subWorkerUrl = URL.createObjectURL(subWorkerBlob);

let fastboard = await createFastboard({
  sdkConfig: {
    appIdentifier: import.meta.env.VITE_APPID || "123456789/123456789",
    region: 'cn-hz',
  },
  joinRoom: {
    uid: Math.random().toString(36).slice(2),
    uuid: import.meta.env.VITE_ROOM_UUID || "b34887c0ae7f11f0a8d9339d21b70bad",
    roomToken: import.meta.env.VITE_ROOM_TOKEN || "NETLESSROOM_YWs9VWtNUk92M1JIN2I2Z284dCZleHBpcmVBdD0xNzYxMTM4Nzk0MjEzJm5vbmNlPWIzNjI1MTUwLWFlN2YtMTFmMC05NmE5LWFiMzg4NjE4OThhZiZyb2xlPTEmc2lnPTIwZGZmY2U3NTZkYzAzNzRjOGIwYmI1MzM1ZjdiYWY2OWM2NjIzZjRiNjdmNzJiNGUyY2EzYzNlZGYxMzliMjYmdXVpZD1iMzQ4ODdjMGFlN2YxMWYwYThkOTMzOWQyMWI3MGJhZA",
  },
  enableAppliancePlugin: {
    cdn: {
        fullWorkerUrl,
        subWorkerUrl,
    },
    extras: {
      useSimple: true,
      strokeWidth: {
        min: 1,
        max: 32
      },
      syncOpt: {
        interval: 200
      },
      cursor: {
        enable: false,
        expirationTime: 10000,
      },
      bezier: {
        enable: true,
        combineUnitTime: 200,
        maxDrawCount: 180,
      },
      textEditor: {
        showFloatBar: false,
        canSelectorSwitch: true,
        rightBoundBreak: true
      }
    }
  }
})
globalThis.fastboard = fastboard
fastboard.manager.onAppEvent('DocsViewer', ev => {
  if (ev.kind == 'DocsViewer' && ev.type == 'pageStateChange')
    console.log('pageStateChange', ev.value, ev.appId)
})

fastboard.manager.emitter.on('appsChange', (apps: string[]) => {
  console.log('apps =', apps.length ? apps.join() : 'empty')
})

let ui = createUI(fastboard, document.querySelector('#whiteboard')!)
globalThis.ui = ui

document.querySelector<HTMLButtonElement>('#btn-add')!.onclick = async () => {
  const r = await data
  if ('err' in r) return console.error(r.err);
  const { progress: { convertedFileList } } = r.ok
  const appId = await fastboard.insertDocs('a.pdf', {
    status: 'Finished',
    images: convertedFileList.map(e => ({
      url: e.conversionFileUrl,
      width: e.width,
      height: e.height,
    })),
    uuid: 'abcdef',
    type: 'static',
    convertedPercentage: 100,
  })
  console.log('insertDocs() =>', appId)
}

document.querySelector<HTMLButtonElement>('#btn-add2')!.onclick = async () => {
  const appId = await fastboard.insertDocs({
    fileType: "pdf",
    scenePath: `/pdf/18140800fe8a11eb8cb787b1c376634e`,
    title: "a.pdf",
    scenes: [
      {
        name: "a.pdf 第 1 页",
        ppt: {
          height: 1010,
          src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/1.png",
          width: 714,
        },
      },
      {
        name: "a.pdf 第 2 页",
        ppt: {
          height: 1010,
          src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/2.png",
          width: 714,
        },
      },
    ],
  });
  console.log('insertDocs() =>', appId)
}

document.querySelector<HTMLButtonElement>('#btn-pdf')!.onclick = async () => {
  const app = fastboard.manager.queryAll().at(-1)
  if (app && app.kind == 'DocsViewer') {
    window.addEventListener('message', ev => {
      if (ev.data && ev.data.type == '@netless/_result_save_pdf_') {
        console.log('..', ev.data)
        if (ev.data.result) {
          const { pdf } = ev.data.result
          open(URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })))
        }
      }
    })
    window.postMessage({
      type: '@netless/_request_save_pdf_',
      appId: app.id,
    }, '*')
  }
}

document.querySelector<HTMLButtonElement>('#save')!.onclick = async () => {
  const appid = fastboard.manager.focused;
  if (!appid) {
    return;
  }
  const app = fastboard.manager.queryOne(appid);
  if (app && app.kind == 'DocsViewer') {
    const canves = document.createElement('canvas');
    const { width, height } = ((app as any).appResult as PresentationController).getPageSize();
    canves.width = width;
    canves.height = height;
    const context = canves.getContext('2d');
    if (!context) {
      console.error('failed to get context');
      return;
    }
    await ((app as any).appResult as PresentationController).screenshotCurrentPageAsync(context, width, height);
    canves.toBlob((blob) => {
      if (!blob) {
        alert("context.toBlob() failed!");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "screenshot.png";
      a.click();
    });
  }
}
