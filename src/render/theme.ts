// Colours of the TOPPING app (see the approved mockup).
export const BG = '#1F1F1F'
export const PLATE = '#383838'
export const PLATE_TEXT = '#D8D8D8'
export const ON = '#4261C0'
export const RED = '#E5483E'
export const YELLOW = '#E2B23A'
export const GREEN = '#73CB67'
export const DIM = '#9A9A9A'
export const WHITE = '#fff'
export const TRACK = '#0F0F0F'
export const TICK = '#666'
export const MUTED_BAR = '#555'
export const OUTLINE = '#3A3A3A'
export const WORKSPACE_ON_BG = '#1E2A4F'
export const WORKSPACE_ON_TEXT = '#8FA8F0'

export type Mix = 0 | 1 | 2 | 3
/** Mix button colours from the TOPPING app, in Mix A..D order. */
export const MIX_COLORS = ['#75CB75', '#309BE8', '#EBCD29', '#FFA500'] as const
export const mixName = (m: Mix): string => `MIX ${'ABCD'[m]}`

export const KEY_COLORS = { blue: ON, red: RED, yellow: YELLOW, green: GREEN } as const
export type KeyColor = keyof typeof KEY_COLORS
