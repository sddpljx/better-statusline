import { amount, span, type StatusProps } from '../ui/shared'

/** One panel in CSS pixels: its width, the ring's centre, radius and stroke, where the words start, the drawing's height. */
const PANEL = 218
const CENTRE = { x: 27, y: 31 }
const RADIUS = 22
const STROKE = 5
const WORDS = 66
const HEIGHT = 62

const HUES: Record<string, [light: string, dark: string]> = {
  coral: ['#d97757', '#e58e6f'],
  teal: ['#2e8b80', '#52b5a8'],
  gold: ['#d49a2c', '#e2b356'],
  indigo: ['#5a5fc8', '#8d91f0'],
  alarm: ['#cf4a3c', '#e8695b'],
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
  '.t{font-size:11.5px;letter-spacing:1.6px;fill:var(--mut)}.v{font-size:19px;font-weight:700}.d{font-size:12.5px;fill:var(--mut)}',
  '.track{fill:none;stroke:var(--track)}.arc{fill:none;stroke:var(--c);stroke-linecap:round}',
].join('')

/** `<` and `&` written so the markup stays well formed. */
const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const twoDigits = (n: number) => String(n).padStart(2, '0')
const timeOf = (ms: number) => `${twoDigits(new Date(ms).getHours())}:${twoDigits(new Date(ms).getMinutes())}`

type Ring = { title: string; hue: string; used: number; value: string; detail: string }

/** A ring lit clockwise from its top as far as `used` (0 to 1), its title, its figure and a line of detail beside it. */
function panel(ring: Ring, x: number) {
  const around = 2 * Math.PI * RADIUS
  const lit = Math.min(1, Math.max(0, ring.used)) * around
  const circle = `cx="${CENTRE.x}" cy="${CENTRE.y}" r="${RADIUS}" stroke-width="${STROKE}"`
  return [
    `<g class="${ring.hue}" transform="translate(${x} 0)">`,
    `<circle class="track" ${circle}/>`,
    lit > 0 ? `<circle class="arc" ${circle} stroke-dasharray="${lit.toFixed(2)} ${around.toFixed(2)}" transform="rotate(-90 ${CENTRE.x} ${CENTRE.y})"/>` : '',
    `<text class="t" x="${WORDS}" y="16">${escaped(ring.title)}</text>`,
    `<text class="v" x="${WORDS}" y="38">${escaped(ring.value)}</text>`,
    `<text class="d" x="${WORDS}" y="56">${escaped(ring.detail)}</text>`,
    '</g>',
  ].join('')
}

/**
 * The session's figures as four rings in a row, for the desktop app, which draws markup where the terminal draws
 * cells: the context window, the prompt cache's minutes left, and each rate-limit window with the time until it
 * starts over. An SVG in the app's own light or dark, with the same told in words as its `alt`.
 */
export function rings(status: StatusProps, now: number) {
  const { context, cache, limits } = status
  const left = cache.at === null ? null : cache.at + cache.span - now
  const drawn: Ring[] = [
    {
      title: 'CONTEXT',
      hue: 'coral',
      used: context.percent / 100,
      value: `${Math.round(context.percent)}%`,
      detail: context.tokens === null ? `of ${amount(context.window)}` : `${amount(context.tokens)} tokens`,
    },
    {
      title: 'CACHE',
      hue: 'teal',
      used: left === null ? 0 : left / cache.span,
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
          used: limit.percent / 100,
          value: `${Math.round(limit.percent)}%`,
          detail: limit.resetsAt === null ? '' : span(limit.resetsAt - now),
        },
      ]
    }),
  ]
  const width = PANEL * drawn.length
  return {
    width,
    height: HEIGHT,
    alt: drawn.map(ring => `${ring.title.toLowerCase()} ${ring.value}${ring.detail === '' ? '' : `, ${ring.detail}`}`).join('; '),
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}"><style>${STYLE}</style>${drawn.map((ring, i) => panel(ring, i * PANEL)).join('')}</svg>`,
  }
}
