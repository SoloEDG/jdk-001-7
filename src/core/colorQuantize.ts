import type { Pixel } from './types'

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB | null {
  const matched = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!matched) return null
  let value = matched[1]
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(value, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * 加权平方色差，绿色通道权重最高，比朴素欧氏距离更接近人眼感知。
 * 仅用于比较大小，权重不需要归一化。
 */
export function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr * 2 + dg * dg * 4 + db * db
}

export function nearestColor(rgb: RGB, palette: RGB[]): RGB {
  let best = palette[0]!
  let bestDistance = Infinity
  for (const candidate of palette) {
    const distance = colorDistance(rgb, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

function channelRanges(samples: RGB[]): [number, number, number] {
  const min: RGB = [255, 255, 255]
  const max: RGB = [0, 0, 0]
  for (const [r, g, b] of samples) {
    if (r < min[0]) min[0] = r
    if (g < min[1]) min[1] = g
    if (b < min[2]) min[2] = b
    if (r > max[0]) max[0] = r
    if (g > max[1]) max[1] = g
    if (b > max[2]) max[2] = b
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

function averageColor(samples: RGB[]): RGB {
  let r = 0
  let g = 0
  let b = 0
  for (const sample of samples) {
    r += sample[0]
    g += sample[1]
    b += sample[2]
  }
  const count = samples.length
  return [r / count, g / count, b / count]
}

/**
 * 中位切分法提取主色：反复沿跨度最大的通道对半切分颜色盒子，
 * 每个盒子取平均色，最多返回 maxColors 种颜色。
 */
export function extractPalette(samples: RGB[], maxColors: number): RGB[] {
  if (samples.length === 0) return []
  const limit = Math.max(1, Math.floor(maxColors))
  const buckets: RGB[][] = [samples.slice()]

  while (buckets.length < limit) {
    let bucketIndex = -1
    let channel = 0
    let bestRange = -1

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i]!
      if (bucket.length < 2) continue
      const ranges = channelRanges(bucket)
      for (let c = 0; c < 3; c++) {
        if (ranges[c]! > bestRange) {
          bestRange = ranges[c]!
          bucketIndex = i
          channel = c
        }
      }
    }

    if (bucketIndex === -1) break

    const bucket = buckets.splice(bucketIndex, 1)[0]!
    bucket.sort((a, b) => a[channel]! - b[channel]!)
    const middle = bucket.length >> 1
    buckets.push(bucket.slice(0, middle), bucket.slice(middle))
  }

  const seen = new Set<string>()
  const result: RGB[] = []
  for (const bucket of buckets) {
    const hex = rgbToHex(averageColor(bucket))
    if (!seen.has(hex)) {
      seen.add(hex)
      result.push(hexToRgb(hex)!)
    }
  }
  return result
}

export type QuantizeMode = 'preset' | 'auto'

export interface QuantizeOptions {
  mode: QuantizeMode
  /** mode 为 preset 时使用的十六进制调色板 */
  presetPalette: string[]
  /** mode 为 auto 时提取的主色上限 */
  maxColors: number
  /** alpha 低于该阈值的像素视为透明，默认 128 */
  alphaThreshold?: number
}

/**
 * 把尺寸为 size×size 的 RGBA 字节数据量化为编辑器像素数组。
 * 透明格写 null；不透明格按所选模式归并到最近的调色板色。
 */
export function quantizeRgba(
  data: Uint8ClampedArray,
  size: number,
  options: QuantizeOptions,
): Pixel[] {
  const pixels: Pixel[] = new Array(size * size).fill(null)
  const threshold = options.alphaThreshold ?? 128
  const opaqueSamples: RGB[] = []
  const targets: { index: number; rgb: RGB }[] = []

  for (let i = 0; i < size * size; i++) {
    const offset = i * 4
    if (data[offset + 3]! < threshold) continue
    const rgb: RGB = [data[offset]!, data[offset + 1]!, data[offset + 2]!]
    opaqueSamples.push(rgb)
    targets.push({ index: i, rgb })
  }

  if (targets.length === 0) return pixels

  let palette: RGB[]
  if (options.mode === 'auto') {
    palette = extractPalette(opaqueSamples, options.maxColors)
  } else {
    palette = options.presetPalette
      .map((hex) => hexToRgb(hex))
      .filter((rgb): rgb is RGB => rgb !== null)
  }
  if (palette.length === 0) palette = [[0, 0, 0]]

  for (const { index, rgb } of targets) {
    pixels[index] = rgbToHex(nearestColor(rgb, palette))
  }
  return pixels
}
