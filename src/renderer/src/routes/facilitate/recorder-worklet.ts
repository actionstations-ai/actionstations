// AudioWorklet for the hot wash recorder (#425). The AudioContext runs at 16 kHz, so Chromium
// resamples the microphone; this processor turns the mono float frames into PCM16 and posts
// about one second at a time, with the peak and RMS level of that second for the meter.
// Loaded from the app bundle (Vite `?worker&url`), never from a blob: URL.

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

const CHUNK_SAMPLES = 16_000

class HotwashRecorderProcessor extends AudioWorkletProcessor {
  private buf = new Int16Array(CHUNK_SAMPLES)
  private n = 0
  private peak = 0
  private sumSq = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data === 'flush') this.post(true)
    }
  }

  private post(final: boolean): void {
    const samples = this.buf.slice(0, this.n)
    const rms = this.n ? Math.sqrt(this.sumSq / this.n) : 0
    this.port.postMessage({ pcm: samples.buffer, peak: this.peak, rms, final, sampleRate }, [
      samples.buffer,
    ])
    this.n = 0
    this.peak = 0
    this.sumSq = 0
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) {
      const v = Math.max(-1, Math.min(1, channel[i]!))
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff
      const a = Math.abs(v)
      if (a > this.peak) this.peak = a
      this.sumSq += v * v
      if (this.n === CHUNK_SAMPLES) this.post(false)
    }
    return true
  }
}

registerProcessor('hotwash-recorder', HotwashRecorderProcessor)
