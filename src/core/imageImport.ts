import { quantizeRgba, type QuantizeOptions } from './colorQuantize'
import type { Pixel } from './types'

export interface RasterImage {
  width: number
  height: number
  pixels: Pixel[]
}

export interface ImageImportResult {
  ok: boolean
  /** 失败原因，供 UI 映射为提示文案 */
  reason?: 'no-project' | 'layer-limit' | 'invalid-image' | 'import-failed'
}

/**
 * 解码图片文件并拉伸（不保持宽高比）绘制到 size×size 的离屏画布，
 * 再按选项把颜色归并到调色板，得到编辑器可直接使用的像素数组。
 */
export function rasterizeImageFile(
  file: File,
  size: number,
  options: QuantizeOptions,
): Promise<RasterImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('canvas-unavailable'))
          return
        }

        // 拉伸填满：宽高比不一致时允许变形，保证每格都有内容
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(image, 0, 0, size, size)

        const { data } = ctx.getImageData(0, 0, size, size)
        const pixels = quantizeRgba(data, size, options)
        URL.revokeObjectURL(url)
        resolve({ width: image.naturalWidth, height: image.naturalHeight, pixels })
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error instanceof Error ? error : new Error('rasterize-failed'))
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('invalid-image'))
    }

    image.src = url
  })
}
