import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { ActFrame, ActName, FrameName, Look, Mood, PetOptions, Pixel, Placement, Preset, Side, Size, Tricks } from '../types'
import { type PetFile, type Pets, withPets } from './pets'
import { FRAME_DY, PAD, PALETTE, PRESETS } from './sprites'

const TICK_MS = 200
const SLEEP_AFTER_TICKS = (5 * 60 * 1000) / TICK_MS
const MARGIN = 3 // columns beside the pet for z's, sparkles and the like
const PANE = 'pet'
const SIZES: Size[] = ['big', 'small', 'head'] // largest first: a size that does not fit falls to the next
const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

const UPPER_HALF = '\u2580'
const LOWER_HALF = '\u2584'

type Glyph = { row: number; column: number; char: string; color: number }
// A size that fits, whether it had to drop the headroom the hop and bob move in, and whether
// it had to drop the room on its right where the dagger flies (and so the toss with it).
type Fit = { size: Size; isCompact: boolean; isNarrow: boolean }

const rowsOf = (pixels: number) => Math.ceil(pixels / 2)

// '#rrggbb' (or 'rrggbb') to 0xRRGGBB; anything else is no colour.
function parseColor(value: unknown): number | null {
  const match = typeof value === 'string' ? /^#?([0-9a-f]{6})$/i.exec(value.trim()) : null

  return match ? parseInt(match[1]!, 16) : null
}

function readOptions(options: PluginOptions): PetOptions {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback

  return {
    isVisible: options.visible !== false,
    placement: options.placement === 'pane' ? 'corner' : pick(options.placement, ['corner', 'band'] as const, 'corner'),
    side: pick(options.side, ['right', 'left', 'center'] as const, 'right'),
    size: pick(options.size, SIZES, 'big'), // 'auto' is the largest, stepping down
    // any key: the pets the person made load after the module, and an unknown one shows Shiro
    pet: typeof options.pet === 'string' && options.pet.trim() ? options.pet.trim().toLowerCase() : 'shiro',
    background: parseColor(options.background),
    isFrameHidden: options.hideFrame !== false,
    isDressed: options.clothes !== false,
    tricks: pick(options.tricks, ['both', 'working', 'idle', 'off'] as const, 'both'),
  }
}

// `needsArc`: whether the dagger flies, so the room on the pet's right is wanted. Without it the
// pet drops that room even where it would fit, and stands centred in its own width.
function fit(preset: Preset, wanted: Size, rows: number, columns: number, needsArc: boolean): Fit | null {
  for (const size of SIZES.slice(SIZES.indexOf(wanted))) {
    const sprite = preset[size]
    const isNarrow = (!needsArc && Boolean(sprite.arc)) || sprite.width + MARGIN > columns
    if (isNarrow && sprite.width - (sprite.arc ?? 0) + MARGIN > columns) continue
    if (rowsOf(sprite.height) <= rows) return { size, isCompact: false, isNarrow }
    if (rowsOf(sprite.height - PAD.top - PAD.bottom) <= rows) return { size, isCompact: true, isNarrow }
  }

  return null
}

// Without headroom the pet stands still (blinks, sleeps and glyphs still show).
const STILL: Record<FrameName, FrameName> = {
  rest: 'rest', breathe: 'rest', blink: 'blink', hop1: 'rest', hop2: 'rest', sleep: 'sleep2', sleep2: 'sleep2',
}

// What the pet does on one tick: its body frame, glyphs beside it, where its eyes look, an ear
// twitch, a frame of a dagger act, and a sideways shake.
type Pose = { frame: FrameName; glyphs: Glyph[]; look?: Look; ears?: boolean; act?: ActFrame; dx?: number }

const IDLE_CYCLE = 150 // ticks in the idle routine: 30 seconds
const WORKING_ROUTINE: ActName[] = ['toss', 'toss', 'twirl']
const IDLE_TRICKS: ActName[] = ['toss', 'toss', 'fumble'] // every third idle toss goes wrong
const MARKS: Record<string, number> = { '!': 0xffa94d, '?': 0xc8cfdc }

const withMark = (glyphs: Glyph[], act: ActFrame): Glyph[] =>
  act.mark ? [...glyphs, { row: 1, column: 0, char: act.mark, color: MARKS[act.mark] ?? 0xc8cfdc }] : glyphs

const actPose = (act: ActFrame, glyphs: Glyph[]): Pose => ({
  frame: act.body,
  glyphs: withMark(glyphs, act),
  look: act.look,
  act,
})

// Which frame of a routine of acts a tick falls on.
function routine(acts: Record<ActName, ActFrame[]>, names: ActName[], tick: number): ActFrame | undefined {
  const length = names.reduce((sum, name) => sum + acts[name].length, 0)
  let at = tick % length
  for (const name of names) {
    if (at < acts[name].length) return acts[name][at]
    at -= acts[name].length
  }

  return undefined
}

// What the pet does on a given tick of a given mood. `acts` are the dagger acts of the size drawn,
// when it has hands for them and tricks are on for this mood.
function pose(current: Mood, tick: number, tricks: Tricks, acts?: Record<ActName, ActFrame[]>): Pose {
  const isBlinking = tick % 23 === 22
  const bob = (every: number): FrameName => (isBlinking ? 'blink' : Math.floor(tick / every) % 2 ? 'breathe' : 'rest')
  const juggles = (when: 'working' | 'idle') => (tricks === 'both' || tricks === when ? acts : undefined)
  switch (current) {
    case 'working': {
      const dots = '.'.repeat((Math.floor(tick / 3) % 3) + 1)
      const glyphs = [...dots].map((char, i) => ({ row: 2, column: i, char, color: 0x9aa3b5 }))
      const working = juggles('working')
      const act = working && routine(working, WORKING_ROUTINE, tick)
      if (act) return actPose(act, glyphs)
      return { frame: bob(2), glyphs, look: tick % 40 < 6 ? 'w' : undefined }
    }
    case 'happy': {
      const hop: FrameName[] = ['rest', 'hop1', 'hop2', 'hop1', 'rest', 'rest']
      return {
        frame: hop[tick % hop.length] ?? 'rest',
        look: 'happy',
        glyphs: [
          { row: 1, column: 1, char: tick % 2 ? '*' : '+', color: 0x30c4be },
          { row: 3, column: 0, char: tick % 2 ? '+' : '*', color: 0xf0f3f8 },
        ],
      }
    }
    case 'error': {
      // a startled look down and a shake of the head, again every two seconds
      const isShaking = tick % 10 < 4
      return {
        frame: 'rest',
        look: 's',
        dx: isShaking ? (tick % 2 ? 1 : -1) : undefined,
        glyphs: tick % 4 < 3 ? [{ row: 2, column: 0, char: '!', color: 0xff6b6b }] : [],
      }
    }
    case 'sleep': {
      const phase = Math.floor(tick / 8) % 2
      return {
        frame: phase ? 'sleep2' : 'sleep',
        ears: tick % 37 < 2, // an ear flicks in his sleep
        glyphs: [
          { row: 3 - phase, column: 0, char: 'z', color: 0xc8cfdc },
          { row: 2 - phase, column: 1, char: 'Z', color: 0xc8cfdc },
        ],
      }
    }
    default: {
      // the idle routine: a dagger trick, then a glance left and right, an ear twitch, a look up
      const at = tick % IDLE_CYCLE
      const idle = juggles('idle')
      const trick = IDLE_TRICKS[Math.floor(tick / IDLE_CYCLE) % IDLE_TRICKS.length] ?? 'toss'
      const act = idle?.[trick][at]
      if (act) return actPose(act, [])
      const look: Look | undefined =
        at >= 60 && at < 66 ? 'w' : at >= 66 && at < 72 ? 'e' : at >= 110 && at < 116 ? 'n' : undefined
      return { frame: bob(5), glyphs: [], look, ears: (at >= 95 && at < 97) || at === 130 }
    }
  }
}

// A run of cells drawn alike. A cell with no pet in it sets no background, so whatever is
// behind the pet (the pane, the band, the terminal) shows through.
type Segment = { text: string; color?: string; backgroundColor?: string }

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

// Two pixels per terminal cell: the upper half block takes the top pixel as its
// foreground and the bottom pixel as its background. The glyph margin sits on
// the side away from the screen edge the pet stands against.
function segments(pixels: string[], width: number, glyphs: Glyph[], isMarginLeft: boolean, palette: Record<string, number | null>): Segment[][] {
  const rows = rowsOf(pixels.length)
  const columns = width + MARGIN
  const offset = isMarginLeft ? MARGIN : 0
  const out: Segment[][] = []
  for (let row = 0; row < rows; row++) {
    const line: Segment[] = []
    const push = (cell: Segment) => {
      const last = line[line.length - 1]
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) last.text += cell.text
      else line.push(cell)
    }
    for (let column = 0; column < columns; column++) {
      const glyph = glyphs.find(
        one => one.row === row && column === (isMarginLeft ? MARGIN - 1 - one.column : width + one.column),
      )
      if (glyph) {
        push({ text: glyph.char, color: hex(glyph.color) })
        continue
      }
      const x = column - offset
      const isPet = x >= 0 && x < width
      const top = isPet ? palette[pixels[row * 2]?.[x] ?? '.'] : null
      const bottom = isPet ? palette[pixels[row * 2 + 1]?.[x] ?? '.'] : null
      if (top != null && bottom != null) push({ text: UPPER_HALF, color: hex(top), backgroundColor: hex(bottom) })
      else if (top != null) push({ text: UPPER_HALF, color: hex(top) })
      else if (bottom != null) push({ text: LOWER_HALF, color: hex(bottom) })
      else push({ text: ' ' })
    }
    out.push(line)
  }

  return out
}

// The pane paints its own (greyer) background, which shows through any cell that sets none.
// So every cell of the pet's pane is given the `background` colour (the terminal's), in text,
// which carries the colour exactly. `pad` adds cells past the body's edges, to cover the frame.
type Pad = { top: number; bottom: number; left: number; right: number }

function paneLines(pet: Segment[][], columns: number, rows: number, background: number | null, pad: Pad): Segment[][] {
  const fill = background === null ? undefined : hex(background)
  const width = columns + pad.left + pad.right
  const blank = (count: number): Segment => ({ text: ' '.repeat(count), backgroundColor: fill })
  const petWidth = Math.max(0, ...pet.map(line => line.reduce((sum, seg) => sum + seg.text.length, 0)))
  const left = pad.left + Math.max(0, Math.floor((columns - petWidth) / 2))
  const shown = pet.slice(-rows)
  const firstPetRow = pad.top + rows - shown.length // the pet stands on the body's bottom row

  return Array.from({ length: pad.top + rows + pad.bottom }, (_, row) => {
    const line = shown[row - firstPetRow]
    if (!line) return [blank(width)]
    const segs = line.map(seg => ({ ...seg, backgroundColor: seg.backgroundColor ?? fill }))
    return [blank(left), ...segs, blank(Math.max(0, width - left - petWidth))]
  })
}

type Shown = { preset: Preset; fit: Fit; isMarginLeft: boolean; tricks: Tricks }

// A frame's pixel rows with layers (eyes, ears, the dagger) drawn over them.
function overlay(rows: string[], layers: readonly Pixel[]): string[] {
  if (!layers.length) return rows
  const grid = rows.map(row => [...row])
  for (const [y, x, c] of layers) {
    const row = grid[y]
    if (row && x >= 0 && x < row.length) row[x] = c
  }

  return grid.map(row => row.join(''))
}

const EYES_SHUT: FrameName[] = ['blink', 'sleep', 'sleep2']

function poseOf({ preset, fit: { size, isNarrow }, tricks }: Shown, mood: Mood, tick: number): Pose {
  // a pane too narrow for the dagger's arc keeps the pet's hands empty
  return pose(mood, tick, isNarrow ? 'off' : tricks, preset[size].acts)
}

function drawing(shown: Shown, mood: Mood, tick: number): Segment[][] {
  const { preset, fit: { size, isCompact, isNarrow }, isMarginLeft } = shown
  const sprite = preset[size]
  const { frame: wanted, glyphs, look, ears, act, dx } = poseOf(shown, mood, tick)
  const frame = isCompact ? STILL[wanted] : wanted
  const shift = PAD.top + FRAME_DY[frame] // eye and ear layers are in sprite pixels
  const layers: Pixel[] = [
    ...(look && !EYES_SHUT.includes(frame) ? sprite.looks[look] : []),
    ...(ears ? sprite.ears : []),
  ].map(([y, x, c]): Pixel => [y + shift, x, c])
  let rows = overlay(sprite.frames[frame], [...layers, ...(act?.dagger ?? [])])
  if (dx) rows = rows.map(row => (dx > 0 ? `.${row.slice(0, -1)}` : `${row.slice(1)}.`))

  const width = isNarrow ? sprite.width - (sprite.arc ?? 0) : sprite.width
  if (isNarrow) rows = rows.map(row => row.slice(0, width))
  // the shared colours, with the pet's own where it names them (its eyes, its fur)
  const palette = preset.palette ? { ...PALETTE, ...preset.palette } : PALETTE
  if (!isCompact) return segments(rows, width, glyphs, isMarginLeft, palette)

  const raised = glyphs.map(glyph => ({ ...glyph, row: Math.max(0, glyph.row - 1) }))
  return segments(rows.slice(PAD.top, sprite.height - PAD.bottom), width, raised, isMarginLeft, palette)
}

// Which picture a moment shows: the timer redraws only when this changes.
function frameKey(shown: Shown, mood: Mood, tick: number): string {
  const { frame, glyphs, look, ears, act, dx } = poseOf(shown, mood, tick)
  const { size, isCompact, isNarrow } = shown.fit

  return JSON.stringify([size, isCompact, isNarrow, isCompact ? STILL[frame] : frame, glyphs, look, ears, act?.dagger, dx])
}

function rasterRows(preset: Preset, { size, isCompact }: Fit): number {
  const height = preset[size].height

  return rowsOf(isCompact ? height - PAD.top - PAD.bottom : height)
}

// The pet as the settings show it: in its outfit, when it has one and clothes are on.
function lookOf(pets: Pets, name: string, isDressed: boolean): Preset {
  const preset = presetOf(pets, name)

  return isDressed && preset.dressed ? { ...preset, ...preset.dressed } : preset
}

function presetOf(pets: Pets, name: string): Preset {
  return pets[name] ?? PRESETS.shiro!
}

// Where the pets the person draws live: ~/.claude/pets (or $CLAUDE_CONFIG_DIR/pets), one folder each.
async function petsFolder($: Pick<EngineInterface, 'env'>): Promise<string | null> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  if (config) return `${config.replace(/[\\/]+$/, '')}/pets`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))

  return home ? `${home.replace(/[\\/]+$/, '')}/.claude/pets` : null
}

// The built-in pets with the person's own from their pets folder: each folder's frames.json.
async function loadPets($: Pick<EngineInterface, 'env' | 'fs'>): Promise<{ pets: Pets; skipped: string[] }> {
  const files: PetFile[] = []
  try {
    const folder = await petsFolder($)
    for (const entry of folder ? await $.fs.list(folder) : []) {
      if (entry.kind === 'file') continue
      const path = `${folder}/${entry.name}/frames.json`
      if (await $.fs.exists(path)) files.push({ name: entry.name, text: String(await $.fs.read(path)) })
    }
  } catch {
    // no pets folder yet, or one that cannot be read: the pets read so far
  }

  return withPets(files)
}

type Field = 'visible' | 'placement' | 'side' | 'size' | 'pet' | 'background' | 'hideFrame' | 'clothes' | 'tricks'
type Overrides = Partial<Record<Field, string | boolean>>

// The plugin's own /config rows: their keys carry the plugin's name, whatever suffix the loader gave it.
async function configRows($: Pick<EngineInterface, 'config'>) {
  return (await $.config.list()).filter(
    row => row.key.startsWith('terminal-pet') || row.provider.plugin.startsWith('terminal-pet'),
  )
}

// A /pet change goes to the plugin's /config row when there is one (the engine then reloads
// the module with it); otherwise it is kept as an override in the plugin's own store.
async function setOption(
  $: Pick<EngineInterface, 'config' | 'store'>,
  field: Field,
  value: string | boolean,
): Promise<{ deny: string } | { isStored: boolean }> {
  const overrides = ((await $.store.get('overrides')) ?? {}) as Overrides
  const row = (await configRows($)).find(one => one.key.endsWith(`.${field}`))
  if (row) {
    const result = await $.config.set({ key: row.key, value })
    if (result.deny) return { deny: result.deny }
    delete overrides[field]
    await $.store.set('overrides', overrides)
    return { isStored: false }
  }
  await $.store.set('overrides', { ...overrides, [field]: value })

  return { isStored: true }
}

async function closePane($: Pick<EngineInterface, 'ui'>): Promise<void> {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) await $.ui.close({ id: PANE })
}

// The corner pet lives in a pane just wide enough for it (docked beside the conversation in
// fullscreen); opens it when the settings put the pet there, and closes it otherwise.
async function placePane($: Pick<EngineInterface, 'ui'>, settings: PetOptions, preset: Preset): Promise<void> {
  if (settings.isVisible && settings.placement === 'corner') {
    // As wide as the pet at its chosen size, with the dagger's arc only while tricks are on;
    // inline, it holds just the head.
    const sprite = preset[settings.size]
    const arc = settings.tricks === 'off' ? (sprite.arc ?? 0) : 0
    const columns = sprite.width - arc + MARGIN + (settings.isFrameHidden ? 0 : 2)
    await $.ui.open({ id: PANE, title: preset.name, columns, rows: rowsOf(preset.head.height) })
  } else {
    await closePane($)
  }
}


// The /pet commands, grouped, each setting's current value at the end of its line.
function help(settings: PetOptions, preset: Preset): string {
  const now = (value: string) => `  (now: ${value})`
  const color = settings.background === null ? 'none' : hex(settings.background)
  return [
    `${preset.name}`,
    `  /pet                          show or hide${now(settings.isVisible ? 'shown' : 'hidden')}`,
    '  /pet on | off',
    '',
    'Where',
    `  /pet corner | band            a narrow side pane, or a row above the prompt${now(settings.placement)}`,
    `  /pet left | right | center    where the pet stands above the prompt${now(settings.side)}`,
    '',
    'Look',
    `  /pet auto | big | small | head   size; steps down when the room is short${now(settings.size)}`,
    `  /pet clothes [on | off]       the outfit; alone, it toggles${now(settings.isDressed ? 'on' : 'off')}`,
    `  /pet tricks [both | working | idle | off]   when the dagger flies; alone, it toggles${now(settings.tricks)}`,
    '',
    'Side pane',
    `  /pet frame off | on           paint over the pane's frame${now(settings.isFrameHidden ? 'off' : 'on')}`,
    `  /pet bg #rrggbb | none        the pane's fill: your terminal's background${now(color)}`,
    '',
    'Pets',
    `  /pet list                     the saved pets${now(settings.pet)}`,
    '  /pet <name>                   switch to a saved pet',
    '',
    '  /pet help                     this list',
    '  /pet debug                    where the settings are read from',
    '',
    'The same settings are rows in /config, under "Pet:".',
  ].join('\n')
}

const SIZE_WORDS: Record<string, string> = { auto: 'auto', big: 'big', small: 'small', head: 'head', mini: 'head', tiny: 'head' }
const PLACEMENT_WORDS: Record<string, Placement> = {
  corner: 'corner', pane: 'corner', side: 'corner', sidebar: 'corner', dock: 'corner',
  band: 'band', above: 'band', prompt: 'band', bar: 'band',
}
const SIDE_WORDS: Record<string, Side> = { left: 'left', right: 'right', center: 'center', centre: 'center', middle: 'center' }

export const register: Register = (on, options) => {
  // /config values, with any /pet overrides kept in the store on top (loaded at session start).
  let settings = readOptions(options)
  // The built-in pets, then the person's own from ~/.claude/pets (at session start and on each /pet).
  let pets: Pets = { ...PRESETS }
  let skipped: string[] = []
  let preset = lookOf(pets, settings.pet, settings.isDressed)
  let mood: Mood = 'idle'
  let tick = 0
  let quietTicks = 0
  let moodUntil = 0 // tick when a short mood (happy, error) ends
  let isTurnRunning = false
  // What the band or pane last drew, so the timer redraws it when the picture changes.
  let shown: Shown | null = null
  let lastFrame = ''

  const setMood = (next: Mood, forTicks = 0) => {
    mood = next
    moodUntil = forTicks ? tick + forTicks : 0
    quietTicks = 0
  }

  const paint = (next: Shown) => {
    shown = next
    lastFrame = frameKey(next, mood, tick)
    return drawing(next, mood, tick)
  }

  const applyOverrides = (overrides: Overrides) => {
    settings = readOptions({ ...options, ...overrides })
    preset = lookOf(pets, settings.pet, settings.isDressed)
  }

  const usePets = (loaded: { pets: Pets; skipped: string[] }) => {
    pets = loaded.pets
    skipped = loaded.skipped
    preset = lookOf(pets, settings.pet, settings.isDressed)
  }

  on('session.start', async ($, e, next) => {
    usePets(await loadPets($))
    applyOverrides(((await $.store.get('overrides')) ?? {}) as Overrides)
    $.ui.invalidate('ui.render')
    await $.command.register({
      name: 'pet',
      description: 'Show, hide, move, resize or switch your terminal pet',
      argumentHint: '[on|off|corner|band|left|right|center|auto|big|small|head|clothes|tricks|frame|bg|list|help|<pet name>]',
      immediate: true,
    })
    void placePane($, settings, preset)

    $.clock.every(TICK_MS, () => {
      tick += 1
      quietTicks += 1
      if (moodUntil && tick >= moodUntil) setMood(isTurnRunning ? 'working' : 'idle')
      if (mood === 'idle' && quietTicks > SLEEP_AFTER_TICKS) mood = 'sleep'
      if (!shown) return

      if (frameKey(shown, mood, tick) !== lastFrame) $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    isTurnRunning = true
    setMood('working')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    quietTicks = 0
    const result = await next(e)
    if (result.isError) setMood('error', 10)

    return result
  })

  on('turn.complete', ($, e, next) => {
    isTurnRunning = false
    if (e.reason === 'answer') setMood('happy', 15)
    else if (e.reason === 'error') setMood('error', 15)
    else setMood('idle')

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (mood === 'sleep') setMood('happy', 10) // poking the pet wakes it
    // a pet just built with make_frames.py shows up without a restart
    usePets(await loadPets($))
    shown = null
    $.ui.invalidate('ui.render')
    const fullscreenNote = e.presentation.isFullscreen
      ? ''
      : ' Outside the fullscreen layout the pane cannot dock beside the conversation, so it opens as a small block above the prompt.'
    // Applies a change: through /config it reloads the module; kept in the store, it applies here.
    const change = async (field: Field, value: string | boolean, text: string) => {
      const result = await setOption($, field, value)
      if ('deny' in result) return { text: `Could not change that: ${result.deny}` }
      if (result.isStored) {
        applyOverrides(((await $.store.get('overrides')) ?? {}) as Overrides)
        shown = null
        await placePane($, settings, preset)
        $.ui.invalidate('ui.render')
      }
      return { text }
    }

    if (arg === '') {
      return change(
        'visible',
        !settings.isVisible,
        settings.isVisible ? `${preset.name} is hiding. /pet brings them back.` : `${preset.name} is back.`,
      )
    }
    if (arg === 'on' || arg === 'off') {
      return change('visible', arg === 'on', arg === 'on' ? 'Pet shown.' : 'Pet hidden.')
    }
    if (arg === 'help') return { text: help(settings, preset) }
    if (arg === 'debug') {
      const rows = await configRows($)
      const overrides = await $.store.get('overrides')
      return {
        text: [
          `options from /config: ${JSON.stringify(options)}`,
          `overrides from /pet: ${JSON.stringify(overrides ?? {})}`,
          `in effect: ${JSON.stringify(settings)}`,
          `fullscreen: ${e.presentation.isFullscreen}`,
          rows.length
            ? `config rows: ${rows.map(row => `${row.key} (${row.provider.plugin})`).join(', ')}`
            : 'config rows: none listed for terminal-pet',
        ].join('\n'),
      }
    }

    const placement = PLACEMENT_WORDS[arg]
    if (placement) {
      if (!settings.isVisible) await setOption($, 'visible', true)
      const where = {
        corner: `${preset.name} moves into a narrow pane beside the conversation, standing in its bottom corner.${fullscreenNote}`,
        band: `${preset.name} stands above the prompt.`,
      }[placement]
      return change('placement', placement, where)
    }
    const side = SIDE_WORDS[arg]
    if (side) {
      return change('side', side, `${preset.name} moves to the ${side}.`)
    }
    const size = SIZE_WORDS[arg]
    if (size) {
      return change(
        'size',
        size,
        size === 'auto'
          ? `${preset.name} takes the largest size that fits.`
          : `${preset.name} is ${size} now; a smaller one stands in when the room is short.`,
      )
    }
    const tricks = /^(?:tricks|dagger|daggers)(?:\s+(both|working|idle|off|on))?$/.exec(arg)
    if (tricks) {
      const value = tricks[1] === 'on' || !tricks[1] ? (settings.tricks === 'off' ? 'both' : 'off') : tricks[1]
      const when = { both: 'while working, and now and then while idle', working: 'while working', idle: 'now and then while idle', off: 'never' }[value as Tricks]
      return change('tricks', value, `${preset.name} tosses the dagger ${when}.`)
    }
    const clothes = /^(?:clothes|outfit|dress)(?:\s+(on|off))?$/.exec(arg)
    if (clothes) {
      if (!presetOf(pets, settings.pet).dressed) return { text: `${preset.name} has no outfit yet.` }
      const isDressed = clothes[1] ? clothes[1] === 'on' : !settings.isDressed
      return change('clothes', isDressed, isDressed ? `${preset.name} gets dressed.` : `${preset.name} takes the outfit off.`)
    }
    const frame = /^frame\s+(on|off|show|hide)$/.exec(arg)?.[1]
    if (frame) {
      const isHidden = frame === 'off' || frame === 'hide'
      return change(
        'hideFrame',
        isHidden,
        isHidden ? `${preset.name}'s pane hides its frame.` : `${preset.name}'s pane shows its frame again.`,
      )
    }
    const color = /^(?:bg|background)\s+(.+)$/.exec(arg)?.[1]
    if (color !== undefined) {
      if (color !== 'none' && parseColor(color) === null) return { text: 'Give the colour as #rrggbb, or none for the pane\'s own.' }
      const value = color === 'none' ? '' : `#${color.replace('#', '')}`
      return change('background', value, value ? `${preset.name}'s pane is filled with ${value}.` : `${preset.name}'s pane keeps its own background.`)
    }
    if (arg === 'list') {
      const lines = Object.entries(pets).map(([key, one]) => `${key === settings.pet ? '*' : ' '} ${key}  (${one.name})`)
      if (!Object.hasOwn(pets, settings.pet)) lines.push(`  ${settings.pet} is chosen but has no frames.json, so Shiro stands in.`)
      if (skipped.length) lines.push('', 'Left out:', ...skipped.map(line => `  ${line}`))
      lines.push('', 'Draw a new one with /pixel-pet.')
      return { text: lines.join('\n') }
    }
    if (Object.hasOwn(pets, arg)) {
      return change('pet', arg, `Say hi to ${presetOf(pets, arg).name}.`)
    }

    return { text: `No pet or command called "${arg}".\n\n${help(settings, preset)}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !settings.isVisible) return next(e)
    // A corner pet whose pane is on screen draws nothing here.
    if (settings.placement === 'corner' && (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    // A corner pet waiting for its pane keeps to its smallest size above the prompt.
    const wanted = settings.placement === 'corner' ? 'head' : settings.size
    const fitted = fit(preset, wanted, e.props.maxRows, e.props.bodyColumns, settings.tricks !== 'off')
    if (!fitted) return next(e)
    const drawn = paint({ preset, fit: fitted, isMarginLeft: settings.side === 'right', tricks: settings.tricks })

    return (
      <Box width={e.props.bodyColumns} justifyContent={JUSTIFY[settings.side]}>
        <Box key="pet" flexDirection="column" height={drawn.length} flexShrink={0}>
          {drawn.map(line => (
            <Text wrap="truncate">
              {line.map(seg => (
                <Text color={seg.color} backgroundColor={seg.backgroundColor}>
                  {seg.text}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{preset.name} lives in the terminal.</Text>
    }

    const { Box, Text } = $.ui.resolve(e)
    const isDocked = e.props.placement === 'dock'
    // Inline above the prompt the pane would be another bar: there, just the head.
    const wanted = isDocked ? settings.size : 'head'
    const fitted = fit(preset, wanted, e.props.scroll.bodyRows, e.props.bodyColumns, settings.tricks !== 'off')
    if (!fitted) return <Text dimColor>Too small for {preset.name}.</Text>
    const drawn = paint({ preset, fit: fitted, isMarginLeft: false, tricks: settings.tricks })

    const columns = e.props.bodyColumns
    const rows = isDocked ? e.props.scroll.bodyRows : drawn.length
    const lines = (pad: Pad) =>
      paneLines(drawn, columns, rows, settings.background, pad).map(line => (
        <Text wrap="truncate">
          {line.map(seg => (
            <Text color={seg.color} backgroundColor={seg.backgroundColor}>
              {seg.text}
            </Text>
          ))}
        </Text>
      ))

    if (!isDocked || !settings.isFrameHidden) {
      return (
        <Box key="pet" flexDirection="column" width={columns} height={rows}>
          {lines({ top: 0, bottom: 0, left: 0, right: 0 })}
        </Box>
      )
    }

    // Hiding the frame: one cell past each edge, over the close-mark row, the bottom edge and the
    // divider, painted in the terminal's colour. The frame still answers the mouse beneath it.
    return (
      <Box key="pet" width={columns} height={rows}>
        <Box position="absolute" top={-1} left={-1} flexDirection="column">
          {lines({ top: 1, bottom: 1, left: 1, right: 0 })}
        </Box>
      </Box>
    )
  })

  // Closing the pane by hand puts the pet back above the prompt.
  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && e.origin.kind === 'person' && settings.placement === 'corner') {
      shown = null
      const result = await setOption($, 'placement', 'band')
      if ('isStored' in result && result.isStored) {
        applyOverrides(((await $.store.get('overrides')) ?? {}) as Overrides)
        $.ui.invalidate('ui.render')
      }
    }

    return result
  })
}
