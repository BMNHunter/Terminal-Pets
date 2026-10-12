export type Size = 'big' | 'small' | 'head'
export type Placement = 'corner' | 'band'
export type Side = 'right' | 'left' | 'center'
export type Mood = 'idle' | 'working' | 'happy' | 'error' | 'sleep'
export type FrameName = 'rest' | 'breathe' | 'blink' | 'hop1' | 'hop2' | 'sleep' | 'sleep2'
// One pixel of a layer drawn over a frame: [row, column, colour].
export type Pixel = [number, number, string]
// Where the eyes look (a direction, or happy ^ ^ eyes).
export type Look = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'happy'
export type ActName = 'toss' | 'fumble' | 'twirl'
// One frame of a dagger act: the body frame, the dagger over it, where the eyes look, a mark beside the pet.
export type ActFrame = { body: FrameName; dagger: Pixel[]; look: Look; mark?: string }
// `looks` and `ears` are layers in sprite pixels (the mod adds the frame's headroom and bob);
// `acts`, when the size has hands for them, are in frame pixels; `arc` is the empty columns on
// the right of `width` the dagger flies through.
export type Sprite = {
  width: number
  height: number
  frames: Record<FrameName, string[]>
  looks: Record<Look, Pixel[]>
  ears: Pixel[]
  acts?: Record<ActName, ActFrame[]>
  arc?: number
}
// When the pet tosses its dagger: while working, now and then while idle, both, or never.
export type Tricks = 'both' | 'working' | 'idle' | 'off'
export type Sprites = { big: Sprite; small: Sprite; head: Sprite }
// A pet's sprites, and the same sprites in its outfit when it has one.
// `palette`: colours this pet gives the shared letters (0xRRGGBB), over the shared palette.
export type Preset = Sprites & { name: string; dressed?: Sprites; palette?: Record<string, number> }
// The pet's settings, read from the plugin's userConfig (the /config menu).
export type PetOptions = {
  isVisible: boolean
  placement: Placement
  side: Side
  size: Size
  pet: string
  background: number | null // the pane's fill, 0xRRGGBB
  isFrameHidden: boolean // paint over the pane's frame
  isDressed: boolean // wear the outfit
  tricks: Tricks
}
