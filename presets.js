import { combineRgb } from '@companion-module/base'
import * as state from './state.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const GREY = combineRgb(40, 40, 40)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 140, 0)
const DARK_GREEN = combineRgb(0, 120, 0)
const BLUE = combineRgb(0, 90, 200)
const ORANGE = combineRgb(230, 120, 0)

const NO_STEPS = [{ down: [], up: [] }]

// API 2.x presets: every preset is { type: 'simple', ... } and the structure lists
// sections > groups > preset ids. Every non-text action option is filled in:
// Companion 5 does not default options missing from a preset.
export default function (self) {
	const v = (name) => `$(${self.label}:${name})`
	const presets = {}
	const structure = []
	const section = (id, name, groups) => {
		const definitions = groups.filter((g) => g.presets.length)
		if (definitions.length) structure.push({ id, name, definitions })
	}
	const group = (id, name, ids) => ({ type: 'simple', id, name, presets: ids })

	// ---------- Display ----------
	presets.toggle_blackout = {
		type: 'simple',
		name: 'Blackout toggle (red when active)',
		style: { text: 'BLACK\nOUT', size: '18', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'toggle_blackout', options: {} }], up: [] }],
		feedbacks: [
			{ feedbackId: 'display_mode', options: { mode: 'Blackout', canvas: -1 }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	presets.toggle_freeze = {
		type: 'simple',
		name: 'Freeze toggle (blue when active)',
		style: { text: 'FREEZE', size: '18', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'toggle_freeze', options: {} }], up: [] }],
		feedbacks: [
			{ feedbackId: 'display_mode', options: { mode: 'Freeze', canvas: -1 }, style: { bgcolor: BLUE, color: WHITE } },
		],
	}
	presets.brightness_up = {
		type: 'simple',
		name: 'Brightness +5 %',
		style: { text: `BRT +\n${v('screen_0_brightness')}`, size: '14', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'brightness_step', options: { screen: 'all', step: 5 } }], up: [] }],
		feedbacks: [],
	}
	presets.brightness_down = {
		type: 'simple',
		name: 'Brightness -5 %',
		style: { text: `BRT -\n${v('screen_0_brightness')}`, size: '14', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'brightness_step', options: { screen: 'all', step: -5 } }], up: [] }],
		feedbacks: [],
	}
	presets.identify = {
		type: 'simple',
		name: 'Cabinet mapping on/off (hold)',
		style: { text: 'CAB\nMAP', size: '18', color: WHITE, bgcolor: GREY },
		steps: [
			{
				down: [{ actionId: 'cabinet_mapping', options: { cabinets: '', state: 'on' } }],
				up: [{ actionId: 'cabinet_mapping', options: { cabinets: '', state: 'off' } }],
			},
		],
		feedbacks: [],
	}

	// ---------- Status ----------
	presets.display_status = {
		type: 'simple',
		name: 'Display state + brightness',
		style: {
			text: `${v('display_state')}\n${v('screen_0_brightness')}`,
			size: '14',
			color: WHITE,
			bgcolor: DARK_GREEN,
		},
		steps: NO_STEPS,
		feedbacks: [
			{ feedbackId: 'display_mode', options: { mode: 'Blackout', canvas: -1 }, style: { bgcolor: RED } },
			{ feedbackId: 'display_mode', options: { mode: 'Freeze', canvas: -1 }, style: { bgcolor: BLUE } },
		],
	}
	presets.device_health = {
		type: 'simple',
		name: 'Controller health / temperature',
		style: { text: `${v('device_health')}\n${v('mainboard_temp')}°C`, size: '14', color: WHITE, bgcolor: DARK_GREEN },
		steps: NO_STEPS,
		feedbacks: [
			{ feedbackId: 'device_health', options: { level: 1 }, style: { bgcolor: ORANGE, color: BLACK } },
			{ feedbackId: 'device_health', options: { level: 2 }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	presets.cabinet_status = {
		type: 'simple',
		name: 'Cabinets: errors / highest temperature',
		style: {
			text: `CAB ${v('cabinet_errors')}/${v('cabinet_count')}\n${v('cabinet_max_temp')}°C`,
			size: '14',
			color: WHITE,
			bgcolor: DARK_GREEN,
		},
		steps: NO_STEPS,
		feedbacks: [
			{ feedbackId: 'cabinet_error', options: { what: 'any' }, style: { bgcolor: ORANGE, color: BLACK } },
			{ feedbackId: 'cabinet_error', options: { what: 'fault' }, style: { bgcolor: RED, color: WHITE } },
			{ feedbackId: 'cabinet_error', options: { what: 'link' }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	presets.connection = {
		type: 'simple',
		name: 'Controller connection',
		style: { text: `${v('device_name')}\n${v('connection_status')}`, size: '14', color: WHITE, bgcolor: RED },
		steps: [{ down: [{ actionId: 'refresh', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'connected', options: {}, style: { bgcolor: DARK_GREEN, color: WHITE } }],
	}

	section('display', 'Display', [
		group('display_mode', 'Blackout and freeze', ['toggle_blackout', 'toggle_freeze']),
		group('brightness', 'Brightness', ['brightness_up', 'brightness_down']),
		group('identify', 'Identify', ['identify']),
	])
	section('status', 'Status', [
		group('status', 'Status', ['display_status', 'device_health', 'cabinet_status', 'connection']),
		group('monitoring', 'Monitoring', ['fans', 'inputs_signal', 'backup_status', 'controller_info', 'uptime']),
	])

	presets.fans = {
		type: 'simple',
		name: 'Slowest fan (orange below 500 RPM)',
		style: {
			text: `FANS
${v('fan_min_speed')} rpm`,
			size: '14',
			color: WHITE,
			bgcolor: DARK_GREEN,
		},
		steps: NO_STEPS,
		feedbacks: [{ feedbackId: 'fan_below', options: { rpm: 500 }, style: { bgcolor: ORANGE, color: BLACK } }],
	}
	presets.inputs_signal = {
		type: 'simple',
		name: 'Inputs with signal',
		style: {
			text: `INPUTS
${v('inputs_with_signal')} live`,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: NO_STEPS,
		feedbacks: [{ feedbackId: 'any_input_signal', options: {}, style: { bgcolor: DARK_GREEN, color: WHITE } }],
	}
	presets.backup_status = {
		type: 'simple',
		name: 'Primary / backup state (red on a failure)',
		style: { text: v('backup_status'), size: '7', color: WHITE, bgcolor: GREY },
		steps: NO_STEPS,
		feedbacks: [{ feedbackId: 'backup_problem', options: { what: 'any' }, style: { bgcolor: RED, color: WHITE } }],
	}
	presets.controller_info = {
		type: 'simple',
		name: 'Controller model and firmware',
		style: {
			text: `${v('device_model')}
${v('device_firmware')}`,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: NO_STEPS,
		feedbacks: [],
	}
	presets.uptime = {
		type: 'simple',
		name: 'Controller uptime',
		style: {
			text: `UPTIME
${v('device_runtime')}`,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: NO_STEPS,
		feedbacks: [],
	}

	// ---------- All screens: hold-to-fire for the dangerous global actions ----------
	presets.blackout_all_hold = {
		type: 'simple',
		name: 'Blackout ALL screens (hold 1 s)',
		style: { text: 'BLACKOUT\nALL\n(hold)', size: '14', color: WHITE, bgcolor: combineRgb(90, 0, 0) },
		steps: [
			{
				down: [],
				up: [],
				1000: { options: { runWhileHeld: true }, actions: [{ actionId: 'display_mode', options: { num: 1 } }] },
			},
		],
		feedbacks: [
			{ feedbackId: 'display_mode', options: { mode: 'Blackout', canvas: -1 }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	presets.normal_all = {
		type: 'simple',
		name: 'Normal ALL screens',
		style: { text: 'NORMAL\nALL', size: '14', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'display_mode', options: { num: 0 } }], up: [] }],
		feedbacks: [
			{
				feedbackId: 'display_mode',
				options: { mode: 'Normal', canvas: -1 },
				style: { bgcolor: DARK_GREEN, color: WHITE },
			},
		],
	}
	section('all_screens', 'All screens', [group('all_screens', 'All screens', ['blackout_all_hold', 'normal_all'])])

	// ---------- Per screen: the H Series style direct controls ----------
	const screenGroups = []
	self.screenChoices().forEach((screen, si) => {
		const ids = []
		const add = (key, preset) => {
			const id = `screen_${si}_${key}`
			presets[id] = preset
			ids.push(id)
		}
		const name = `$(${self.label}:screen_${si}_name)`
		const brightness = `$(${self.label}:screen_${si}_brightness_num)`

		add('blackout', {
			type: 'simple',
			name: `${screen.label}: Blackout toggle`,
			style: { text: `${name}\nBLACKOUT`, size: '14', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'display_mode_screen_toggle', options: { screen: screen.id, mode: 1 } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'display_mode_screen',
					options: { screen: screen.id, mode: 1 },
					style: { bgcolor: RED, color: WHITE },
				},
			],
		})
		add('freeze', {
			type: 'simple',
			name: `${screen.label}: Freeze toggle`,
			style: { text: `${name}\nFREEZE`, size: '14', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'display_mode_screen_toggle', options: { screen: screen.id, mode: 2 } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'display_mode_screen',
					options: { screen: screen.id, mode: 2 },
					style: { bgcolor: BLUE, color: WHITE },
				},
			],
		})

		// Brightness ring: a native API 2.1 gauge reading the brightness variable, with
		// a plain text fallback for hosts that cannot draw layered buttons.
		add('brightness_ring', {
			type: 'alternatives',
			variants: [
				{
					type: 'layered',
					name: `${screen.label}: Brightness ring`,
					canvas: { decoration: 'none' },
					elements: [
						{
							id: 'ring_group',
							name: 'Ring',
							type: 'group',
							x: 0,
							y: 0,
							width: 100,
							height: 100,
							squareCoords: true,
							children: [
								{
									id: 'brightness_gauge',
									name: 'Brightness',
									type: 'gauge',
									x: 6,
									y: 6,
									width: 88,
									height: 88,
									min: 0,
									max: 100,
									value: { isExpression: true, value: brightness },
									orientation: 'ring',
									startAngle: 215,
									endAngle: 145,
									ringWidth: 15,
									roundedEnds: true,
									fillEnabled: true,
									multiColour: true,
									stops: [
										{ value: 0, color: combineRgb(0, 45, 20), gradient: true },
										{ value: 50, color: combineRgb(0, 150, 60), gradient: true },
										{ value: 100, color: combineRgb(90, 255, 140), gradient: false },
									],
									trackStyle: 'dimmed',
									trackAmount: 25,
								},
							],
						},
						{
							id: 'value',
							name: 'Value',
							type: 'text',
							x: 0,
							y: 26,
							width: 100,
							height: 38,
							text: { isExpression: true, value: `concat(${brightness}, "%")` },
							fontsize: 100,
							fontsizeAllowShrink: true,
							color: WHITE,
							halign: 'center',
							valign: 'center',
						},
						{
							id: 'label',
							name: 'Label',
							type: 'text',
							x: 0,
							y: 64,
							width: 100,
							height: 24,
							text: name,
							fontsize: 55,
							fontsizeAllowShrink: true,
							color: WHITE,
							halign: 'center',
							valign: 'center',
						},
					],
					steps: NO_STEPS,
					feedbacks: [],
				},
				{
					type: 'simple',
					name: `${screen.label}: Brightness`,
					style: { text: `${name}\n${brightness}%`, size: 'auto', color: WHITE, bgcolor: BLACK },
					steps: NO_STEPS,
					feedbacks: [],
				},
			],
		})

		// Hold to ramp: one step on press, then keeps going until released
		add('bright_up', {
			type: 'simple',
			name: `${screen.label}: Brightness + (hold to ramp)`,
			style: { text: `${name}\nBRT +\n${brightness}%`, size: '14', color: WHITE, bgcolor: GREY },
			steps: [
				{
					down: [{ actionId: 'brightness_ramp_up', options: { screen: screen.id, step: 1, ms: 120 } }],
					up: [{ actionId: 'brightness_ramp_stop', options: { screen: screen.id } }],
				},
			],
			feedbacks: [],
		})
		add('bright_down', {
			type: 'simple',
			name: `${screen.label}: Brightness - (hold to ramp)`,
			style: { text: `${name}\nBRT -\n${brightness}%`, size: '14', color: WHITE, bgcolor: GREY },
			steps: [
				{
					down: [{ actionId: 'brightness_ramp_down', options: { screen: screen.id, step: 1, ms: 120 } }],
					up: [{ actionId: 'brightness_ramp_stop', options: { screen: screen.id } }],
				},
			],
			feedbacks: [],
		})

		// Fixed levels, lit when the screen is at that level
		for (let level = 100; level >= 0; level -= 10) {
			add(`level_${level}`, {
				type: 'simple',
				name: `${screen.label}: Brightness ${level} %`,
				style: { text: `${name}\n${level}%`, size: '14', color: WHITE, bgcolor: GREY },
				steps: [{ down: [{ actionId: 'brightness_screen', options: { screen: screen.id, value: level } }], up: [] }],
				feedbacks: [
					{
						feedbackId: 'brightness_compare',
						options: { screen: screen.id, op: 'eq', value: level },
						style: { bgcolor: combineRgb(0, 110, 50), color: WHITE },
					},
				],
			})
		}
		screenGroups.push(group(`screen_${si}`, screen.label, ids))
	})
	section('screens', 'Screens', screenGroups)

	// ---------- Colour per screen: temperature and gamma, lit at the current value ----------
	const colourGroups = []
	self.screenChoices().forEach((screen, si) => {
		const ids = []
		const add = (key, preset) => {
			const id = `colour_${si}_${key}`
			presets[id] = preset
			ids.push(id)
		}
		const name = `$(${self.label}:screen_${si}_name)`
		const ct = `$(${self.label}:screen_${si}_colortemp)`
		const gamma = `$(${self.label}:screen_${si}_gamma)`
		const lit = combineRgb(0, 110, 50)

		add('display', {
			type: 'simple',
			name: `${screen.label}: Colour temperature and gamma (tinted like the white point)`,
			style: {
				text: `${name}
${ct}
γ ${gamma}`,
				size: '14',
				color: BLACK,
				bgcolor: GREY,
			},
			steps: NO_STEPS,
			feedbacks: [{ feedbackId: 'screen_color_temperature_display', options: { screenIndex: si } }],
		})
		for (const [key, step, label] of [
			['ct_down', -100, 'WARMER'],
			['ct_up', 100, 'COOLER'],
		]) {
			add(key, {
				type: 'simple',
				name: `${screen.label}: Colour temperature ${step > 0 ? '+' : ''}${step} K`,
				style: {
					text: `${name}
${label}
${ct}`,
					size: '14',
					color: WHITE,
					bgcolor: GREY,
				},
				steps: [{ down: [{ actionId: 'colortemp_step', options: { screen: screen.id, step } }], up: [] }],
				feedbacks: [],
			})
		}
		for (const kelvin of [3200, 4300, 5600, 6500, 7500, 9300]) {
			add(`ct_${kelvin}`, {
				type: 'simple',
				name: `${screen.label}: ${kelvin} K`,
				style: {
					text: `${name}
${kelvin}K`,
					size: '14',
					color: WHITE,
					bgcolor: GREY,
				},
				steps: [{ down: [{ actionId: 'colortemp_screen', options: { screen: screen.id, value: kelvin } }], up: [] }],
				feedbacks: [
					{ feedbackId: 'colortemp_is', options: { screen: screen.id, kelvin }, style: { bgcolor: lit, color: WHITE } },
				],
			})
		}
		for (const [key, step] of [
			['gamma_down', -0.1],
			['gamma_up', 0.1],
		]) {
			add(key, {
				type: 'simple',
				name: `${screen.label}: Gamma ${step > 0 ? '+' : ''}${step}`,
				style: {
					text: `${name}
γ ${step > 0 ? '+' : '-'}
${gamma}`,
					size: '14',
					color: WHITE,
					bgcolor: GREY,
				},
				steps: [{ down: [{ actionId: 'gamma_step', options: { screen: screen.id, step } }], up: [] }],
				feedbacks: [],
			})
		}
		for (const g of [2.2, 2.4, 2.6, 2.8]) {
			add(`gamma_${String(g).replace('.', '_')}`, {
				type: 'simple',
				name: `${screen.label}: Gamma ${g}`,
				style: {
					text: `${name}
γ ${g}`,
					size: '14',
					color: WHITE,
					bgcolor: GREY,
				},
				steps: [{ down: [{ actionId: 'gamma_screen', options: { screen: screen.id, value: g } }], up: [] }],
				feedbacks: [
					{ feedbackId: 'gamma_is', options: { screen: screen.id, gamma: g }, style: { bgcolor: lit, color: WHITE } },
				],
			})
		}
		colourGroups.push(group(`colour_${si}`, screen.label, ids))
	})
	section('colour', 'Colour', colourGroups)

	// ---------- Test patterns, each button in its own colour ----------
	const tpIds = []
	const tp = (key, label, mode, rgb, bg, fg = WHITE) => {
		const id = `testpattern_${key}`
		presets[id] = {
			type: 'simple',
			name: `Test pattern: ${label}`,
			style: { text: label, size: '14', color: fg, bgcolor: bg },
			steps: [
				{
					down: [
						{
							actionId: 'testpattern',
							options: {
								mode,
								red: rgb[0],
								green: rgb[1],
								blue: rgb[2],
								gray: 255,
								gridWidth: 255,
								moveSpeed: 100,
								gradientStretch: 1,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
		tpIds.push(id)
	}
	const FULL = 4095
	tp('red', 'Red', 0, [FULL, 0, 0], combineRgb(200, 0, 0))
	tp('green', 'Green', 0, [0, FULL, 0], combineRgb(0, 170, 0))
	tp('blue', 'Blue', 0, [0, 0, FULL], combineRgb(0, 60, 220))
	tp('white', 'White', 0, [FULL, FULL, FULL], WHITE, BLACK)
	tp('black', 'Black', 0, [0, 0, 0], BLACK)
	tp('grid', 'Grid', 20, [FULL, FULL, FULL], combineRgb(60, 60, 60))
	tp('hlines', 'Lines H', 16, [FULL, FULL, FULL], combineRgb(60, 60, 60))
	tp('vlines', 'Lines V', 17, [FULL, FULL, FULL], combineRgb(60, 60, 60))
	tp('grey_grad', 'Grey ramp', 35, [FULL, FULL, FULL], combineRgb(110, 110, 110))
	presets.testpattern_off = {
		type: 'simple',
		name: 'Test pattern off',
		style: { text: 'TEST\nOFF', size: '14', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'testpattern_off', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'test_pattern_active', options: {}, style: { bgcolor: ORANGE, color: BLACK } }],
	}
	tpIds.push('testpattern_off')

	const rxIds = []
	const rx = (key, label, mode, bg, fg = WHITE) => {
		const id = `cabinet_pattern_${key}`
		presets[id] = {
			type: 'simple',
			name: `Cabinet pattern: ${label}`,
			style: { text: `CAB\n${label}`, size: '14', color: fg, bgcolor: bg },
			steps: [{ down: [{ actionId: 'cabinet_test_pattern', options: { cabinets: '', mode } }], up: [] }],
			feedbacks: [],
		}
		rxIds.push(id)
	}
	rx('red', 'Red', 4, combineRgb(200, 0, 0))
	rx('green', 'Green', 5, combineRgb(0, 170, 0))
	rx('blue', 'Blue', 6, combineRgb(0, 60, 220))
	rx('white', 'White', 7, WHITE, BLACK)
	rx('grey', 'Greyscale', 12, combineRgb(110, 110, 110))
	rx('off', 'Normal', 1, GREY)
	section('test_patterns', 'Test patterns', [
		group('sending', 'Sending card (whole output)', tpIds),
		group('cabinets', 'Cabinets (receiving cards)', rxIds),
	])

	// ---------- Inputs (Send-Only mode): switch to it, green with signal ----------
	const inputIds = []
	;(self.inputs || []).forEach((input, i) => {
		if (!input.name) return
		const id = `input_${i}`
		presets[id] = {
			type: 'simple',
			name: `Input ${input.name}`,
			style: {
				text: `${input.name}\n${v(`input_${i}_resolution`)}`,
				size: '14',
				color: WHITE,
				bgcolor: combineRgb(150, 0, 0),
			},
			steps: [{ down: [{ actionId: 'source', options: { num: input.name } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'input_signal', options: { input: input.name }, style: { bgcolor: GREEN, color: WHITE } },
			],
		}
		inputIds.push(id)
	})
	section('inputs', 'Inputs (Send-Only mode)', [group('inputs', 'Inputs', inputIds)])

	// ---------- Layer inputs (All-in-One mode): first layer of each screen ----------
	const layerGroups = []
	;(self.layerChoices ? self.layerChoices() : [])
		.filter((l, i, all) => all.findIndex((x) => x.id.split('|')[0] === l.id.split('|')[0]) === i)
		.forEach((layer, li) => {
			const ids = []
			;(self.inputs || []).forEach((input, i) => {
				if (!input.name) return
				const id = `layer_${li}_input_${i}`
				presets[id] = {
					type: 'simple',
					name: `${layer.label}: ${input.name}`,
					style: { text: input.name, size: '14', color: WHITE, bgcolor: GREY },
					steps: [
						{
							down: [{ actionId: 'layer_source', options: { layer: layer.id, source: String(input.groupId) } }],
							up: [],
						},
					],
					feedbacks: [
						{
							feedbackId: 'layer_input',
							options: { input: input.name, layer: layer.id },
							style: { bgcolor: GREEN, color: WHITE },
						},
						{
							feedbackId: 'input_signal',
							options: { input: input.name },
							isInverted: true,
							style: { color: combineRgb(255, 80, 80) },
						},
					],
				}
				ids.push(id)
			})
			layerGroups.push(group(`layer_${li}`, layer.label, ids))
		})
	section('layers', 'Layer inputs (All-in-One mode)', layerGroups)

	// ---------- Presets: one button per preset, per screen, blue while active ----------
	const presetGroups = []
	self.screenChoices().forEach((screen, si) => {
		const ids = []
		state.presetsForScreen(self, screen.id).forEach((p) => {
			const choice = `${screen.id}|${p.sequenceNumber}`
			const id = `preset_${si}_${p.sequenceNumber}`
			presets[id] = {
				type: 'simple',
				name: `${screen.label}: ${p.name}`,
				style: { text: p.name, size: '14', color: WHITE, bgcolor: GREY },
				steps: [{ down: [{ actionId: 'preset_screen', options: { preset: choice } }], up: [] }],
				feedbacks: [
					{ feedbackId: 'preset_active_screen', options: { preset: choice }, style: { bgcolor: BLUE, color: WHITE } },
				],
			}
			ids.push(id)
		})
		presetGroups.push(group(`presets_${si}`, screen.label, ids))
	})
	section('presets', 'Presets', presetGroups)

	self.setPresetDefinitions(structure, presets)
}
