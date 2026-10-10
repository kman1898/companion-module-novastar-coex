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
