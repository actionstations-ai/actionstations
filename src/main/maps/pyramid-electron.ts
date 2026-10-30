// The Electron side of the tile pyramid (#500): cuts tiles with `nativeImage`, which decodes PNG,
// JPEG and WebP. Kept apart from `pyramid.ts` so that module tests without Electron.
import { nativeImage } from 'electron'
import type { Imaging } from './pyramid'

export const electronImaging: Imaging = {
  open(bytes) {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes))
    const { width, height } = image.getSize()
    return {
      width,
      height,
      tile(region, size) {
        const part = image.crop(region)
        const same = size.width === region.width && size.height === region.height
        return (same ? part : part.resize({ ...size, quality: 'best' })).toPNG()
      },
    }
  },
}
