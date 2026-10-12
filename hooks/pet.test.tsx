import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { withPets } from './pets'
import { FORMAT, FRAME_DY, PAD, PRESETS } from './sprites'

const band = (maxRows: number, isFullscreen = false) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 120, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
    viewport: { columns: 125, rows: 60, isFullscreen },
  }) as const

// What sits beneath the pet in a session: a settings store, no panes open, and the engine's own (empty) band.
const engine = (on: On) => {
  mock.store(on)
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

test('above the prompt, the pet is drawn in the band', { options: { placement: 'band', size: 'small' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  const raster = await ui.find({ key: 'pet' })
  expect(raster?.type).toBe('Box')
  expect(raster?.props.height).toBe(18) // small sprite: 36 pixel rows, two per cell
  await ui.unmount()
})

test('a pet too tall for the band steps down a size, then drops its headroom', { options: { placement: 'band', size: 'auto' } }, async ($, on) => {
  engine(on)
  const rowsAt = async (maxRows: number) => {
    const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(maxRows) })
    const rows = (await ui.find({ key: 'pet' }))?.props.height
    await ui.unmount()
    return rows
  }

  expect(await rowsAt(45)).toBe(41) // big, with room to hop
  expect(await rowsAt(40)).toBe(39) // big, standing still
  expect(await rowsAt(20)).toBe(18) // small
  expect(await rowsAt(17)).toBe(16) // small, standing still
  expect(await rowsAt(12)).toBe(12) // head only
  expect(await rowsAt(10)).toBe(10) // head only, standing still
  expect(await rowsAt(9)).toBeUndefined()
})

const pane = (placement: 'dock' | 'inline', bodyRows: number, bodyColumns = 29) =>
  ({
    component: 'Pane',
    requestId: 'pet',
    props: { title: 'Shiro', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows }, view: {} },
    viewport: { columns: 160, rows: 50, isFullscreen: placement === 'dock' },
  }) as const

test('docked, the corner pane is filled in the terminal colour, reaching over its frame', { options: { placement: 'corner', size: 'small' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...pane('dock', 45) })
  const body = await ui.find({ key: 'pet' })
  expect(body?.props.width).toBe(29)
  expect(body?.props.height).toBe(45)
  const cover = (await ui.findAll({ type: 'Box' })).find(box => box.props.position === 'absolute')
  expect(cover?.props.top).toBe(-1)
  expect(cover?.props.left).toBe(-1)
  // every blank cell carries the terminal's #0c0c0c, exactly, so the pane's grey never shows
  const pieces = (await ui.findAll({ type: 'Text' })).filter(text => text.props.wrap === undefined) // not the line wrappers
  const blanks = pieces.filter(text => /^ +$/.test(text.text ?? ''))
  expect(blanks.length).toBeGreaterThan(0)
  expect(blanks.every(text => text.props.backgroundColor === '#0c0c0c')).toBe(true)
  await ui.unmount()
})

test('with the frame shown, the pane fills just its body', { options: { placement: 'corner', size: 'small', hideFrame: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...pane('dock', 45) })
  expect((await ui.find({ key: 'pet' }))?.props.height).toBe(45)
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props.position === 'absolute')).toBe(false)
  await ui.unmount()
})

test('inline, the corner pane holds just the head', { options: { placement: 'corner', size: 'big' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...pane('inline', 20) })
  expect((await ui.find({ key: 'pet' }))?.props.height).toBe(12)
  await ui.unmount()
})

test('a corner pet waiting for its pane shows just its head above the prompt', { options: { placement: 'corner', size: 'small' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(30) })
  expect((await ui.find({ key: 'pet' }))?.props.height).toBe(12)
  await ui.unmount()
})

test('a hidden pet draws nothing', { options: { visible: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40, true) })
  expect(await ui.find({ key: 'pet' })).toBeUndefined()
  await ui.unmount()
})

test('other surfaces are left alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'desktop', ...band(40) })
  expect(await ui.find({ key: 'pet' })).toBeUndefined()
  await ui.unmount()
})

const pet = (args: string) =>
  ({
    command: 'pet',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  }) as const

test('with no /config rows to write, /pet keeps its changes itself and applies them at once', { options: { placement: 'band', size: 'head' } }, async ($, on) => {
  engine(on)
  on('config.list', () => ({ value: [] }))

  const before = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await before.find({ key: 'pet' }))?.props.height).toBe(12) // head only
  await before.unmount()

  const said = await $.command.run(pet('band'))
  expect(said.text).toContain('above the prompt')
  await $.command.run(pet('small'))
  const after = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await after.find({ key: 'pet' }))?.props.height).toBe(18)
  await after.unmount()

  await $.command.run(pet(''))
  const hidden = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect(await hidden.find({ key: 'pet' })).toBeUndefined()
  await hidden.unmount()
})

const colorsIn = async (ui: { findAll: (query: { type: 'Text' }) => Promise<readonly { props: Record<string, unknown> }[]> }) =>
  new Set((await ui.findAll({ type: 'Text' })).flatMap(text => [text.props.color, text.props.backgroundColor]))

test('the pet wears its outfit by default', { options: { placement: 'band', size: 'small' } }, async ($, on) => {
  engine(on)
  const VEST = '#4a4440'
  const dressed = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await colorsIn(dressed)).has(VEST)).toBe(true)
  await dressed.unmount()
})

test('with clothes off, no outfit colours are drawn', { options: { placement: 'band', size: 'small', clothes: false } }, async ($, on) => {
  engine(on)
  const VEST = '#4a4440'
  const bare = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  const colors = await colorsIn(bare)
  expect(colors.has(VEST)).toBe(false)
  expect(colors.has('#3a2622')).toBe(true) // the chest marking shows again
  await bare.unmount()
})

const BLADE = '#b9b2a6'

test('the pet starts a dagger toss now and then while idle', { options: { placement: 'band', size: 'small', clothes: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await colorsIn(ui)).has(BLADE)).toBe(true) // the first tick is the toss's first frame: dagger in hand
  await ui.unmount()
})

test('with tricks off there is no dagger', { options: { placement: 'band', size: 'small', clothes: false, tricks: 'off' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await colorsIn(ui)).has(BLADE)).toBe(false)
  await ui.unmount()
})

test('a pane too narrow for the dagger shows the whole small pet, without the toss', { options: { placement: 'corner', size: 'small', clothes: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...pane('dock', 45, 27) })
  const colors = await colorsIn(ui)
  expect(colors.has('#3a2622')).toBe(true) // the chest marking: the body is there, not just the head
  expect(colors.has(BLADE)).toBe(false)
  await ui.unmount()
})

test('with the frame hidden, the pane asks for room for the dagger only while tricks are on', { options: { placement: 'corner', size: 'small', clothes: false } }, async ($, on) => {
  engine(on)
  on('config.list', () => ({ value: [] }))
  const asked: number[] = []
  on('ui.open', ($, e) => {
    if (e.columns !== undefined) asked.push(e.columns)
    return { value: { isPlaced: true } }
  })

  await $.command.run(pet('tricks off'))
  expect(asked.at(-1)).toBe(27) // just the pet: 24 columns, and 3 for its z's and sparkles
  await $.command.run(pet('tricks both'))
  expect(asked.at(-1)).toBe(33) // and the 6 columns the dagger flies through

  // with tricks off the pet stands centred in its own width, even where the arc would fit
  await $.command.run(pet('tricks off'))
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...pane('dock', 45, 40) })
  expect((await colorsIn(ui)).has(BLADE)).toBe(false)
  await ui.unmount()
})

test('/pet help lists every command with the current settings', { options: { placement: 'band', size: 'small', tricks: 'idle' } }, async ($, on) => {
  engine(on)
  const { text } = await $.command.run(pet('help'))
  for (const word of ['corner | band', 'clothes', 'tricks', 'frame', 'bg #rrggbb', 'list', 'debug']) expect(text).toContain(word)
  expect(text).toContain('(now: band)')
  expect(text).toContain('(now: small)')
  expect(text).toContain('(now: idle)')
})

// A pet's frames.json as make_frames.py writes it: Shiro's sprites under another name, with amber eyes.
const kira = (format = FORMAT) =>
  JSON.stringify({ format, pad: PAD, frameDy: FRAME_DY, ...PRESETS.shiro, name: 'Kira', palette: { T: 0xe0a030 } })

test('a pet drawn with /pixel-pet joins the built-in ones, under its folder name', () => {
  const { pets, skipped } = withPets([{ name: 'Kira', text: kira() }])
  expect(Object.keys(pets).sort()).toEqual(['kira', 'shiro'])
  expect(pets.kira?.name).toBe('Kira')
  expect(pets.kira?.palette?.T).toBe(0xe0a030)
  expect(pets.kira?.small.frames.rest).toEqual(PRESETS.shiro!.small.frames.rest)
  expect(skipped).toEqual([])
})

test('a frames.json from other tools, or not one at all, is left out with the reason', () => {
  const { pets, skipped } = withPets([
    { name: 'old', text: kira(FORMAT + 1) },
    { name: 'broken', text: '{' },
    { name: 'empty', text: JSON.stringify({ format: FORMAT, pad: PAD, frameDy: FRAME_DY, name: 'Empty' }) },
  ])
  expect(Object.keys(pets)).toEqual(['shiro'])
  expect(skipped).toEqual([
    'old: built by another version of the tools: run make_frames.py again',
    'broken: frames.json is not JSON',
    'empty: frames.json is missing its sprites',
  ])
})

test('a chosen pet with no frames.json shows Shiro, and /pet list says so', { options: { placement: 'band', size: 'small', pet: 'kira' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'terminal-pet', surface: 'terminal', ...band(40) })
  expect((await ui.find({ key: 'pet' }))?.props.height).toBe(18)
  await ui.unmount()

  const { text } = await $.command.run(pet('list'))
  expect(text).toContain('  shiro  (Shiro)')
  expect(text).toContain('kira is chosen but has no frames.json')
  expect(text).toContain('/pixel-pet')
  expect((await $.command.run(pet('kira'))).text).toContain('No pet or command called "kira"')
})
