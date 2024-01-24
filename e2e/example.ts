
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

const taskId = '41628f60400011eeb65f91720b4a9938'
const taskToken = 'NETLESSTASK_YWs9c21nRzh3RzdLNk1kTkF5WCZub25jZT00MThlODE2MC00MDAwLTExZWUtODc3Ny00OWYxM2UxMmYxNmImcm9sZT0yJnNpZz03MjkxOGFhNjIzZmJjMzM4YTEyNTg3MTRiYWRlMzZlMmM4NjUzMWM1YmRmMWVhMWY5ODk4NWM4ZDZkNWFmMTUxJnV1aWQ9NDE2MjhmNjA0MDAwMTFlZWI2NWY5MTcyMGI0YTk5Mzg'

const url = `https://api.netless.link/v5/services/conversion/tasks/${taskId}?type=static`

export const data: Promise<Result<ConversionResponse>> =
  fetch(url, { headers: { token: taskToken } }).then(r => r.ok ? Ok(r.json()) : Err(r.text()))
