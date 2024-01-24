import { styles, Presentation } from './src'
import { data } from './e2e/example'

data.then(r => {
  if ('err' in r) {
    document.querySelector('.wrapper')!.textContent = r.err
  } else if ('ok' in r) {
    document.head.appendChild(document.createElement('style')).textContent = styles
    const { progress: { convertedFileList } } = r.ok
    const presentation = globalThis.presentation = new Presentation({
      pages: convertedFileList.map(a => ({
        src: a.conversionFileUrl,
        width: a.width,
        height: a.height,
      }))
    })
    document.querySelector('.wrapper')?.appendChild(presentation.dom)
  }
})
