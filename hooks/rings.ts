import { ICON, amount, cells, span, type StatusProps } from '../ui/shared'

/** The header's row in CSS pixels: its height and its text's baseline and size. */
const HEAD = 22
const BASELINE = 13
const HEAD_SIZE = 12
/** One ring: its centre, radius and stroke; where its words start; the drawing's height. */
const CENTRE = { x: 17, y: HEAD + 19 }
const RADIUS = 14
const STROKE = 3.5
const WORDS = 42
const HEIGHT = 63
/** The words beside a ring: the size of the title, the figure and the detail, and the title's letter spacing. */
const SIZE = { title: 10, value: 14, detail: 10.5 }
const SPACING = 1.2
/** Pixels between two panels, and between two items of the header. */
const GAP = 26
const ITEM_GAP = 18
/** A monospace glyph's advance, in ems. */
const ADVANCE = 0.6

const HUES: Record<string, [light: string, dark: string]> = {
  coral: ['#d97757', '#e58e6f'],
  teal: ['#2e8b80', '#52b5a8'],
  gold: ['#d49a2c', '#e2b356'],
  indigo: ['#5a5fc8', '#8d91f0'],
  alarm: ['#cf4a3c', '#e8695b'],
  green: ['#3d8b4f', '#7cc48a'],
  ultra: ['#8a5cd6', '#b49af2'],
}

/** The rate-limit windows the desktop draws, by the label the status gives them. */
const LIMITS: Record<string, { title: string; hue: string }> = {
  '5-hour': { title: '5H LIMIT', hue: 'gold' },
  weekly: { title: 'WEEKLY', hue: 'indigo' },
}

const hues = (theme: 0 | 1) => Object.entries(HUES).map(([name, colors]) => `.${name}{--c:${colors[theme]}}`).join('')

const STYLE = [
  `svg{--fg:#2b2925;--mut:#8b877f;--track:#ebe7e0}${hues(0)}`,
  `@media(prefers-color-scheme:dark){svg{--fg:rgba(255,255,255,.92);--mut:rgba(255,255,255,.52);--track:rgba(255,255,255,.12)}${hues(1)}}`,
  'text{font-family:"SF Mono",SFMono-Regular,Menlo,monospace;fill:var(--fg)}',
  `.h{font-size:${HEAD_SIZE}px}.b{font-weight:700}.m{fill:var(--mut)}${Object.keys(HUES).map(name => `tspan.${name}`).join(',')}{fill:var(--c)}`,
  `.t{font-size:${SIZE.title}px;letter-spacing:${SPACING}px;fill:var(--mut)}.v{font-size:${SIZE.value}px;font-weight:700}.d{font-size:${SIZE.detail}px;fill:var(--mut)}`,
  '.track{fill:none;stroke:var(--track)}.arc{fill:none;stroke:var(--c);stroke-linecap:round}',
].join('')

/** `<` and `&` written so the markup stays well formed. */
const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Pixels `text` takes at `size` in a monospace font, CJK and emoji at two glyphs' width. */
const across = (text: string, size: number, spacing = 0) => cells(text) * size * ADVANCE + [...text].length * spacing

const twoDigits = (n: number) => String(n).padStart(2, '0')
const timeOf = (ms: number) => `${twoDigits(new Date(ms).getHours())}:${twoDigits(new Date(ms).getMinutes())}`

/** A stretch of the header: its text, the classes it is drawn in, and the pixels before it. */
type Piece = { text: string; cls?: string; dx?: number }
/** An item of the header, which leaves first when the row runs short (the highest rank). */
type Item = { rank: number; pieces: Piece[] }

/**
 * Who works, where and on what, and the subagents at it, as the terminal's header tells them, held still: the mark
 * does not turn, the model's name does not shimmer, the subagents have no spinner.
 */
function header(status: StatusProps): Item[] {
  const { git, effort, edits } = status
  /** The page's fonts carry no Nerd Font glyphs. */
  const icon = ICON.unicode
  return [
    {
      rank: 0,
      pieces: [
        { text: '✻', cls: 'coral' },
        { text: status.model, cls: 'b', dx: 6 },
        ...(effort === null ? [] : [{ text: effort, cls: effort === 'max' || effort === 'xhigh' ? 'ultra' : 'm', dx: 10 }]),
      ],
    },
    { rank: 4, pieces: [{ text: icon.folder, cls: 'm' }, { text: status.place, dx: 6 }] },
    ...(git === null
      ? []
      : [
          {
            rank: 3,
            pieces: [
              { text: icon.branch, cls: 'm' },
              { text: git.branch, dx: 6 },
              ...(git.staged > 0 ? [{ text: `+${git.staged}`, cls: 'green', dx: 6 }] : []),
              ...(git.modified > 0 ? [{ text: `~${git.modified}`, cls: 'gold', dx: 6 }] : []),
            ],
          },
        ]),
    ...(status.agents === 0 ? [] : [{ rank: 1, pieces: [{ text: '●', cls: 'coral' }, { text: String(status.agents), dx: 6 }, { text: status.agents === 1 ? 'agent' : 'agents', cls: 'm', dx: 6 }] }]),
    ...(edits.added + edits.removed === 0 ? [] : [{ rank: 5, pieces: [{ text: `+${edits.added}`, cls: 'green' }, { text: `−${edits.removed}`, cls: 'alarm', dx: 6 }] }]),
  ]
}

const itemWidth = (item: Item) => item.pieces.reduce((sum, piece) => sum + (piece.dx ?? 0) + across(piece.text, HEAD_SIZE), 0)

/** The header's items that fit `room`, the highest ranks leaving first, as one line of text. */
function headerLine(items: Item[], room: number) {
  let kept = items
  const total = () => kept.reduce((sum, item) => sum + itemWidth(item), ITEM_GAP * (kept.length - 1))
  while (kept.length > 1 && total() > room) {
    const last = kept.reduce((a, b) => (b.rank > a.rank ? b : a))
    kept = kept.filter(item => item !== last)
  }
  const pieces = kept.flatMap((item, i) => item.pieces.map((piece, j) => (i > 0 && j === 0 ? { ...piece, dx: ITEM_GAP } : piece)))
  const tspans = pieces.map(piece => `<tspan${piece.cls === undefined ? '' : ` class="${piece.cls}"`}${piece.dx === undefined ? '' : ` dx="${piece.dx}"`}>${escaped(piece.text)}</tspan>`)
  return { text: `<text class="h" x="1" y="${BASELINE}">${tspans.join('')}</text>`, alt: kept.map(item => item.pieces.map(piece => piece.text).join(' ')).join(', ') }
}

/** A panel of the row: a ring lit clockwise from its top as far as `used` (0 to 1), or none where `used` is null, and its words. */
type Panel = { title: string; hue: string; used: number | null; value: string; dollar?: boolean; detail: string }

const wordsAt = (panel: Panel) => (panel.used === null ? 0 : WORDS)

const panelWidth = (panel: Panel) =>
  wordsAt(panel) + Math.max(across(panel.title, SIZE.title, SPACING), across(panel.value, SIZE.value), across(panel.detail, SIZE.detail))

function panelOf(panel: Panel, x: number) {
  const around = 2 * Math.PI * RADIUS
  const circle = `cx="${CENTRE.x}" cy="${CENTRE.y}" r="${RADIUS}" stroke-width="${STROKE}"`
  const ring =
    panel.used === null
      ? []
      : [
          `<circle class="track" ${circle}/>`,
          panel.used > 0
            ? `<circle class="arc" ${circle} stroke-dasharray="${(Math.min(1, panel.used) * around).toFixed(2)} ${around.toFixed(2)}" transform="rotate(-90 ${CENTRE.x} ${CENTRE.y})"/>`
            : '',
        ]
  const value = panel.dollar ? `<tspan class="${panel.hue}">$</tspan>${escaped(panel.value.slice(1))}` : escaped(panel.value)
  const words = wordsAt(panel)
  return [
    `<g class="${panel.hue}" transform="translate(${x.toFixed(1)} 0)">`,
    ...ring,
    `<text class="t" x="${words}" y="${HEAD + 9}">${escaped(panel.title)}</text>`,
    `<text class="v" x="${words}" y="${HEAD + 25}">${value}</text>`,
    `<text class="d" x="${words}" y="${HEAD + 37}">${escaped(panel.detail)}</text>`,
    '</g>',
  ].join('')
}

/**
 * The session's figures for the desktop app, which draws markup where the terminal draws cells: the terminal's header
 * on a still line, and under it a ring each for the context window, the prompt cache's minutes left and each
 * rate-limit window with the time until it starts over, then the spend in words, without the terminal's bars. An SVG
 * in the app's own light or dark, with the same told in words as its `alt`.
 */
export function rings(status: StatusProps, now: number) {
  const { context, cache, limits } = status
  const left = cache.at === null ? null : cache.at + cache.span - now
  const drawn: Panel[] = [
    {
      title: 'CONTEXT',
      hue: 'coral',
      used: Math.max(0, context.percent / 100),
      value: `${Math.round(context.percent)}%`,
      detail: context.tokens === null ? `of ${amount(context.window)}` : `${amount(context.tokens)} tokens`,
    },
    {
      title: 'CACHE',
      hue: 'teal',
      used: left === null ? 0 : Math.max(0, left / cache.span),
      value: left === null ? '–' : left > 0 ? `${Math.ceil(left / 60_000)} min` : 'cold',
      detail: left === null ? 'no reply yet' : `${left > 0 ? 'expires' : 'expired'} ${timeOf(cache.at! + cache.span)}`,
    },
    ...limits.flatMap(limit => {
      const look = LIMITS[limit.label]
      if (look === undefined) return []
      return [
        {
          title: look.title,
          hue: limit.percent >= 90 ? 'alarm' : look.hue,
          used: Math.max(0, limit.percent / 100),
          value: `${Math.round(limit.percent)}%`,
          detail: limit.resetsAt === null ? '' : span(limit.resetsAt - now),
        },
      ]
    }),
    ...(status.cost === null
      ? []
      : [
          {
            title: 'SPENT',
            hue: 'gold',
            used: null,
            value: `$${status.cost.toFixed(2)}`,
            dollar: true,
            detail: `${amount(status.tokens.sent)} in · ${amount(status.tokens.received)} out`,
          },
        ]),
  ]
  const xs = drawn.reduce<number[]>((at, panel, i) => [...at, i === 0 ? 0 : at[i - 1]! + panelWidth(drawn[i - 1]!) + GAP], [])
  const width = Math.ceil(xs.at(-1)! + panelWidth(drawn.at(-1)!) + 2)
  const head = headerLine(header(status), width - 2)
  return {
    width,
    height: HEIGHT,
    alt: [head.alt, ...drawn.map(panel => `${panel.title.toLowerCase()} ${panel.value}${panel.detail === '' ? '' : `, ${panel.detail}`}`)].join('; '),
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}"><style>${STYLE}</style>${head.text}${drawn.map((panel, i) => panelOf(panel, xs[i]!)).join('')}</svg>`,
  }
}
