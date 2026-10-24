import { TONE, type Grid, type Run } from './shared'

/** How bright a dot is drawn: the empty track, the hue made faint, the hue, and warning past a limit's pace. */
const FAINT = 1
const DIM = 2
const LIT = 3
const WARN = 4

/** The braille bit of each dot in a cell, by row then column. */
const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

/** A field of braille dots `cols` cells wide and `rows` tall; a cell takes the brightest ink of its dots, as a
 * terminal cell has one foreground. */
function field(cols: number, rows: number) {
  const w = cols * 2
  const h = rows * 4
  const ink = new Uint8Array(w * h)
  const put = (x: number, y: number, level: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h && level > ink[y * w + x]!) ink[y * w + x] = level
  }
  const runs = (hue: string): Run[][] =>
    Array.from({ length: rows }, (_, r) => {
      const row: Run[] = []
      for (let c = 0; c < cols; c++) {
        let bits = 0
        let top = 0
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const level = ink[(4 * r + dy) * w + 2 * c + dx]!
            if (level === 0) continue
            bits |= BITS[dy]![dx]!
            top = Math.max(top, level)
          }
        const run: Run =
          top === 0
            ? { text: ' ' }
            : { text: String.fromCodePoint(0x2800 + bits), ...[{}, { color: TONE.track }, { color: hue, dim: true }, { color: hue }, { color: TONE.warn }][top] }
        const last = row.at(-1)
        if (last !== undefined && last.color === run.color && last.dim === run.dim) last.text += run.text
        else row.push(run)
      }
      return row
    })
  return { w, h, put, runs }
}

function line(put: (x: number, y: number, level: number) => void, x0: number, y0: number, x1: number, y1: number, level: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), level)
}

/** The context window's fill turn by turn, oldest first: a bright line over dim dots, its peak at four fifths. */
export function trend(values: number[], cols: number, rows: number, hue: string) {
  const f = field(cols, rows)
  const points = values.length === 1 ? [values[0]!, values[0]!] : values
  if (points.length === 0) {
    for (let x = 0; x < f.w; x += 2) f.put(x, f.h - 1, FAINT)
    return f.runs(hue)
  }
  const top = Math.max(...points) * 1.25 || 1
  let previous = -1
  for (let x = 0; x < f.w; x++) {
    const t = (x / (f.w - 1)) * (points.length - 1)
    const a = Math.floor(t)
    const value = points[a]! + ((points[Math.min(points.length - 1, a + 1)] ?? points[a]!) - points[a]!) * (t - a)
    const y = Math.round((1 - value / top) * (f.h - 1))
    line(f.put, Math.max(0, x - 1), previous < 0 ? y : previous, x, y, LIT)
    for (let below = y + 1; below < f.h; below++) f.put(x, below, DIM)
    previous = y
  }
  return f.runs(hue)
}

type Dot = { x: number; y: number; at: number }
const circles = new Map<string, { cols: number; dots: Dot[] }>()

/**
 * The dots of a ring `rows` rows of cells tall on the terminal's dot grid, each with how far round the ring it lies,
 * clockwise from the top, and the columns of cells it is drawn in: as many as it is tall in cell widths. Its top and
 * bottom are the first and last rows of dots; its sides stand on the columns of dots the same way in from either edge,
 * so its centre falls on the middle or the edge of a cell, where the words at its heart can stand centred, and no side
 * ends between two columns. Of those, the widest no wider than the ring is tall: a ring a little tall still reads as
 * round, where a wider one runs flat along its top. Round it, one dot is taken per
 * column where the circle runs flatter than a diagonal and one per row where it runs steeper, the nearest to it, and
 * the top left quarter is mirrored into the other three, so the ring is one line of dots the same on every side.
 */
function circle(rows: number, { aspect, pitch }: Grid) {
  const key = `${rows}@${aspect}@${pitch}`
  const kept = circles.get(key)
  if (kept !== undefined) return kept
  const px = (x: number) => (x >> 1) + 0.25 + 0.5 * (x & 1)
  const py = (y: number) => aspect * ((y >> 2) + pitch * (y & 3))
  const bottom = rows * 4 - 1
  const tall = py(bottom) - py(0)
  const cols = Math.ceil(tall)
  let left = 0
  while (px(2 * cols - 1 - left) - px(left) > tall) left++
  const right = 2 * cols - 1 - left
  const [cx, cy, rx, ry] = [cols / 2, (py(0) + py(bottom)) / 2, (px(right) - px(left)) / 2, tall / 2]
  const nearest = (to: (i: number) => number, first: number, last: number, v: number) => {
    let found = first
    for (let i = first + 1; i <= last; i++) if (Math.abs(to(i) - v) < Math.abs(to(found) - v)) found = i
    return found
  }
  const quarter: [number, number][] = []
  for (let x = left; px(x) <= cx; x++) {
    const across = (cx - px(x)) / rx
    if (across <= Math.SQRT1_2) quarter.push([x, nearest(py, 0, bottom, cy - ry * Math.sqrt(1 - across ** 2))])
  }
  for (let y = 0; py(y) <= cy; y++) {
    const down = (cy - py(y)) / ry
    if (down <= Math.SQRT1_2) quarter.push([nearest(px, left, right, cx - rx * Math.sqrt(1 - down ** 2)), y])
  }
  const placed = new Map<number, Dot>()
  for (const [qx, qy] of quarter)
    for (const [x, y] of [[qx, qy], [left + right - qx, qy], [qx, bottom - qy], [left + right - qx, bottom - qy]] as const)
      placed.set(y * 2 * cols + x, { x, y, at: (1.25 - Math.atan2(cy - py(y), px(x) - cx) / (2 * Math.PI)) % 1 })
  const made = { cols, dots: [...placed.values()] }
  circles.set(key, made)
  return made
}

/**
 * A ring of dots lit clockwise from its top to `used` (warning past `pace`), the empty track beyond: one line of dots
 * all the way round, the spent part told from the rest by its colour alone. Any use at all lights its first dot.
 * Round on the terminal's `grid` of dots.
 */
export function ring(used: number, rows: number, grid: Grid, hue: string, pace?: number) {
  const { cols, dots } = circle(rows, grid)
  const f = field(cols, rows)
  const reach = used > 0 ? Math.max(used, Math.min(...dots.map(dot => dot.at))) + 1e-9 : -1
  for (const { x, y, at } of dots) f.put(x, y, at <= reach ? (pace !== undefined && at > pace ? WARN : LIT) : FAINT)
  return f.runs(hue)
}

/** One dot-wide bars a dot apart across `cols` cells, the newest at the right edge, as tall as the square root of their
 * values against the tallest, so one dear turn leaves the rest standing: the newest lit, the ones before it dim, and a
 * cell no turn has reached yet the empty track's one dot. */
export function bars(values: number[], cols: number, rows: number, hue: string) {
  const f = field(cols, rows)
  const top = Math.max(...values, 0) || 1
  const empty = cols - values.length
  for (let i = 0; i < empty; i++) f.put(2 * i, f.h - 1, FAINT)
  values.forEach((value, i) => {
    const level = i === values.length - 1 ? LIT : DIM
    for (let k = 0; k < Math.max(1, Math.round(Math.sqrt(value / top) * f.h)); k++) f.put(2 * (empty + i), f.h - 1 - k, level)
  })
  return f.runs(hue)
}

/** One row of dots lit column by column from the left to `used`, warning past `pace`, the empty track beyond. */
export function lane(used: number, cols: number, hue: string, pace?: number) {
  const f = field(cols, 1)
  const lit = Math.round(used * f.w * 4)
  for (let i = 0; i < f.w * 4; i++) {
    const x = Math.floor(i / 4)
    f.put(x, 3 - (i % 4), i < lit ? (pace !== undefined && x / f.w > pace ? WARN : LIT) : FAINT)
  }
  return f.runs(hue)[0]!
}
