import type { Preset, Size } from '../types'
import { FORMAT, FRAME_DY, PAD, PRESETS } from './sprites'

export type Pets = Record<string, Preset>
// A pet folder's frames.json, as read: the folder's name and the file's text.
export type PetFile = { name: string; text: string }

const SIZES: Size[] = ['big', 'small', 'head']

const isSprite = (value: unknown): boolean => {
  const sprite = value as Partial<Preset['big']> | undefined
  return typeof sprite?.width === 'number' && typeof sprite.height === 'number' && typeof sprite.frames?.rest?.[0] === 'string'
}

// A pet's frames.json, as the pixel-pet skill's make_frames.py writes it: kept only when it was
// built for the frames this version draws, so an old file never draws garbled. A string says why not.
export function parsePet(text: string): Preset | string {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    return 'frames.json is not JSON'
  }
  const pad = data.pad as typeof PAD | undefined
  const frameDy = data.frameDy as Record<string, number> | undefined
  const isSameFrames = Object.entries(FRAME_DY).every(([frame, dy]) => frameDy?.[frame] === dy)
  if (data.format !== FORMAT || pad?.top !== PAD.top || pad.bottom !== PAD.bottom || !isSameFrames) {
    return 'built by another version of the tools: run make_frames.py again'
  }
  if (typeof data.name !== 'string' || !SIZES.every(size => isSprite(data[size]))) return 'frames.json is missing its sprites'
  const { format: _format, pad: _pad, frameDy: _frameDy, ...preset } = data

  return preset as Preset
}

// The built-in pets with the person's own over them (a folder named like a built-in one replaces
// it); `skipped` says why a folder was left out.
export function withPets(files: readonly PetFile[]): { pets: Pets; skipped: string[] } {
  const pets: Pets = { ...PRESETS }
  const skipped: string[] = []
  for (const { name, text } of files) {
    const key = name.toLowerCase()
    const pet = parsePet(text)
    if (typeof pet === 'string') skipped.push(`${key}: ${pet}`)
    else pets[key] = pet
  }

  return { pets, skipped }
}
