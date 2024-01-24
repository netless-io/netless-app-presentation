/// <reference types="vite/client" />
import { register, createFastboard, createUI, dispatchDocsEvent } from '@netless/fastboard'
import { install } from '../src'
import { data } from './example'

install(register, { as: 'DocsViewer' })
globalThis.dispatchDocsEvent = dispatchDocsEvent

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
