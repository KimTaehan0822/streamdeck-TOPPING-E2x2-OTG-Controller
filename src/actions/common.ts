// Settings come from the PI as strings (select values), so everything is parsed with Number().
// A blank or space-only field is "no value": Number(' ') is 0, which would jump a fader to 0 dB.
export const num = (v: unknown): number => ((typeof v === 'string' && v.trim() === '') || v === null || typeof v === 'boolean' ? NaN : Number(v))
export const int = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined => {
	const n = num(v)
	return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}
export const pick = <T extends string>(v: unknown, labels: Record<T, unknown>): T | undefined =>
	typeof v === 'string' && Object.hasOwn(labels, v) ? (v as T) : undefined
/** The key's own name (setting `name`, trimmed, at most 24 characters), or the default when it is empty. */
export const nameOf = (settings: { name?: unknown }, fallback: string): string => (typeof settings.name === 'string' && settings.name.trim().slice(0, 24).trim()) || fallback
