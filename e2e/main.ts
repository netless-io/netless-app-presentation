/// <reference types="vite/client" />
import { register, createFastboard, createUI } from '@netless/fastboard'
import { install, type PresentationController } from '../src'

install(register, { as: 'DocsViewer' })

let fastboard = await createFastboard({
  sdkConfig: {
    appIdentifier: import.meta.env.VITE_APPID,
    region: 'cn-hz',
  },
  joinRoom: {
    uid: Math.random().toString(36).slice(2),
    uuid: import.meta.env.VITE_ROOM_UUID,
    roomToken: import.meta.env.VITE_ROOM_TOKEN,
  },
})
globalThis.fastboard = fastboard
fastboard.manager.onAppEvent('DocsViewer', console.log)

let ui = createUI(fastboard, document.querySelector('#whiteboard')!)
globalThis.ui = ui

document.querySelector<HTMLButtonElement>('#btn-add')!.onclick = async () => {
  const appId = await fastboard.insertDocs('a.pdf', {
    status: 'Finished',
    images: [
      { url: 'https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/1.png', width: 714, height: 1010 },
      { url: 'https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/2.png', width: 714, height: 1010 },
    ],
    uuid: 'abcdef',
    type: 'static',
    convertedPercentage: 100,
  })
  console.log('=>', appId)
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