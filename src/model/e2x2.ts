export const MIX_GROUPS = [
	[0x61, 0x62],
	[0x63, 0x64],
	[0x65, 0x66],
	[0x67, 0x68],
] as const

export const MIX_INPUTS = {
	in1: 1,
	in2: 2,
	otg: [3, 4],
	pb12: [5, 6],
	pb34: [7, 8],
	pb56: [9, 10],
	pb78: [11, 12],
} as const

export const INPUT_GROUPS = { in1: 0x21, mobile: 0x22, in2: 0x23, in4: 0x24 } as const
export const INPUT_ITEMS = { mon: 1, p48v: 2, inst: 3, gain: 5 } as const

export const OUTPUTS = {
	out12: { vol: [0x31, 0x32], source: 0x35, gain: { group: 0x35, item: 2 } },
	mobile: { vol: [0x33, 0x34], source: 0x36, gain: { group: 0x36, item: 2 } },
	spdif: { vol: [0x5a, 0x5b], source: 0x5c },
} as const

export const PHONES = { hp: [0x37, 1], trs: [0x37, 3], aux: [0x37, 5] } as const

export const LOOPBACKS = {
	lp12: { vol: [0x51, 0x52], source: 0x57 },
	lp34: { vol: [0x53, 0x54], source: 0x58 },
	lp56: { vol: [0x55, 0x56], source: 0x59 },
} as const

export const SOURCES = {
	mixA: 0x0b,
	mixB: 0x0c,
	mixC: 0x0d,
	mixD: 0x0e,
	in1: 0x01,
	in2: 0x03,
	in12: 0x05,
	mobile: 0x02,
	pb12: 0x07,
	pb34: 0x08,
	pb56: 0x09,
	pb78: 0x0a,
} as const

export const START = { group: 0x11, item: 1, value: 1 } as const
