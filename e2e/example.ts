
type Result<T> = { ok: T } | { err: string }
const Ok = <T>(p: Promise<T>): Promise<Result<T>> => p.then(ok => ({ ok }))
const Err = (p: Promise<string>): Promise<Result<unknown>> => p.then(err => ({ err }))

interface ConversionResponse {
  progress: {
    convertedFileList: {
      width: number
      height: number
      conversionFileUrl: string
    }[]
  }
}

const taskId = 'cbc67f00169f11f0826bfd782d7d3846'
const taskToken = 'NETLESSROOM_YWs9VWtNUk92M1JIN2I2Z284dCZleHBpcmVBdD0xNzYwNjIzODgxNTUxJm5vbmNlPWQzODU1ZGYwLWE5ZDAtMTFmMC05NmE5LWFiMzg4NjE4OThhZiZyb2xlPTEmc2lnPWVjNzNiNzM3ZmMzMjBjNDViYmE1NDY5ODAyNjA1MjU3MWE3MDVjYjg4ODRjNzEzNDY1YTRmOTUwOTE3N2IxYzgmdXVpZD1jYmM2N2YwMDE2OWYxMWYwODI2YmZkNzgyZDdkMzg0Ng'

const url = `https://api.netless.link/v5/services/conversion/tasks/${taskId}?type=static`

export const data: Promise<Result<ConversionResponse>> =
  fetch(url, { headers: { token: taskToken } }).then(r => r.ok ? Ok(r.json()) : Err(r.text()))
