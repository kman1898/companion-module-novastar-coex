import ExtraActions from './actions_extra.js'
import * as state from './state.js'

// The original module's actions. Their ids and options must not change: buttons
// people already have depend on them. They used to go through the
// @novastar-dev/coex library; they now send the same requests directly, without
// the library's bugs (brightness 1 % sent as 100 %, comma-separated screen IDs
// sent as one ID, the missing test pattern call).

const DISPLAY_MODE_CHOICES = [
	{ id: 0, label: 'Normal' },
	{ id: 1, label: 'Blackout' },
	{ id: 2, label: 'Freeze' },
]

export default function (self) {
	const allScreens = () => {
		const ids = state.allScreenIds(self)
		if (!ids.length) throw new Error('No screens known yet')
		return ids
	}
	// Display mode of the first canvas, as the library's toggles read it
	const currentMode = async (api) => {
		const d = await api.displayState()
		return d?.displayState?.[0]?.displayMode
	}

	const defs = {
		source: {
			name: 'Change Input Source',
			options: [
				{
					id: 'num',
					type: 'dropdown',
					label: 'Mode',
					default: self.sourcelist[0]?.id ?? '',
					choices: self.sourcelist,
					allowCustom: true,
				},
			],
			callback: (event) =>
				self.run('Change input source', async (api) => {
					const key = String(event.options.num)
					const sources = await api.sources()
					const src = sources.find((s) => s.name === key || String(s.groupId) === key)
					if (!src) throw new Error(`Unknown input: ${key}`)
					await api.layerInputGroup(src.groupId)
				}),
		},
		brightness: {
			name: 'Brightness',
			options: [{ id: 'num', type: 'number', label: 'Brightness', default: 50, min: 0, max: 100, clampValues: true }],
			callback: (event) =>
				self.run('Brightness', (api) => api.brightness(Number(event.options.num) / 100, allScreens())),
		},
		gamma: {
			name: 'Gamma',
			options: [
				{ id: 'num', type: 'number', label: 'Gamma', default: 2.8, min: 1, max: 4, step: 0.1, clampValues: true },
			],
			callback: (event) =>
				self.run('Gamma', (api) => api.gamma(Math.max(1, Math.min(4, Number(event.options.num))), allScreens())),
		},
		display_mode: {
			name: 'Display Mode',
			options: [{ id: 'num', type: 'dropdown', label: 'Mode', default: 0, choices: DISPLAY_MODE_CHOICES }],
			callback: (event) => self.run('Display mode', (api) => api.displayModeAll(Number(event.options.num))),
		},
		colortemp: {
			name: 'Color Temperature',
			options: [
				{ id: 'num', type: 'number', label: 'Color Temp', default: 6500, min: 1700, max: 15000, clampValues: true },
			],
			callback: (event) =>
				self.run('Color temperature', (api) =>
					api.colorTemperature(Math.max(1700, Math.min(15000, Number(event.options.num))), allScreens()),
				),
		},
		preset: {
			name: 'Preset',
			description: 'Recalls a preset on the first screen. Use "Preset (per screen)" for other screens.',
			options: [
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset Name',
					default: self.presetlist[0]?.id ?? '',
					choices: self.presetlist,
					allowCustom: true,
				},
			],
			callback: (event) =>
				self.run('Preset', async (api) => {
					const screenID = allScreens()[0]
					const key = String(event.options.preset)
					const p = state
						.presetsForScreen(self, screenID)
						.find((x) => x.name === key || String(x.sequenceNumber) === key)
					if (!p) throw new Error(`Unknown preset: ${key}`)
					await api.applyPreset(p.sequenceNumber, screenID)
				}),
		},
		testpattern: {
			name: 'Test Pattern',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Test Pattern',
					default: 0,
					choices: [
						{ id: 0, label: 'Color' },
						{ id: 16, label: 'Horizontal stripes to the bottom' },
						{ id: 17, label: 'Horizontal stripes to the right' },
						{ id: 18, label: 'Slashes' },
						{ id: 19, label: 'Backslashes' },
						{ id: 20, label: 'Grid to the bottom right' },
						{ id: 21, label: 'Grid to the right' },
						{ id: 32, label: 'Left-to-right red gradient' },
						{ id: 33, label: 'Left-to-right green gradient' },
						{ id: 34, label: 'Left-to-right blue gradient' },
						{ id: 35, label: 'Left-to-right gray gradient' },
						{ id: 36, label: 'Top-to-bottom red gradient' },
						{ id: 37, label: 'Top-to-bottom green gradient' },
						{ id: 38, label: 'Top-to-bottom blue gradient' },
						{ id: 39, label: 'Top-to-bottom gray gradient' },
						{ id: 48, label: 'Lightning' },
					],
				},
				{
					id: 'params',
					type: 'static-text',
					label:
						'Some of the test patterns use optional parameters, such as color values for "Color" pattern, or speed for gradients and other patterns. Default values are included.',
					value: '',
				},
				{ id: 'red', type: 'number', label: 'Red', default: 4095, min: 0, max: 4095, clampValues: true },
				{ id: 'green', type: 'number', label: 'Green', default: 4095, min: 0, max: 4095, clampValues: true },
				{ id: 'blue', type: 'number', label: 'Blue', default: 4095, min: 0, max: 4095, clampValues: true },
				{
					id: 'gray',
					type: 'number',
					label: 'Grayscale / Brightness',
					default: 255,
					min: 0,
					max: 255,
					clampValues: true,
				},
				{
					id: 'gridWidth',
					type: 'number',
					label: 'Grid Width / Size',
					default: 255,
					min: 0,
					max: 255,
					clampValues: true,
				},
				{ id: 'moveSpeed', type: 'number', label: 'Movement Speed', default: 100, min: 0, max: 100, clampValues: true },
				{
					id: 'gradientStretch',
					type: 'number',
					label: 'Gradient Stretch',
					default: 1,
					min: 1,
					max: 20,
					clampValues: true,
				},
			],
			// The library never had a test pattern call, so this action failed in
			// every 2.x release. It now sends the documented request directly.
			callback: (event) => {
				const o = event.options
				const parameters = {
					red: Number(o.red),
					green: Number(o.green),
					blue: Number(o.blue),
					gray: Number(o.gray),
					gridWidth: Number(o.gridWidth),
					moveSpeed: Number(o.moveSpeed),
					gradientStretch: Number(o.gradientStretch),
					state: 1,
				}
				return self.run('Test pattern', (api) => api.testPattern(Number(o.mode), parameters))
			},
		},
		set_3dlut_status: {
			name: '3D LUT Status (Set)',
			options: [
				{
					id: 'enable',
					type: 'dropdown',
					label: 'Status',
					default: false,
					choices: [
						{ id: true, label: 'Enable' },
						{ id: false, label: 'Disable' },
					],
				},
				{
					id: 'screenids',
					type: 'textinput',
					label: 'Screen IDs (optional, comma-separated, blank for all)',
					default: '',
				},
			],
			callback: (event) =>
				self.run('3D LUT status', (api) => {
					const text = String(event.options.screenids ?? '').trim()
					const ids = text
						? text
								.split(',')
								.map((s) => s.trim())
								.filter(Boolean)
						: allScreens()
					return api.lut3dEnable(event.options.enable === true, ids)
				}),
		},
		toggle_blackout: {
			name: 'Toggle Blackout/Normal',
			options: [],
			callback: () =>
				self.run('Toggle blackout', async (api) => {
					const mode = await currentMode(api)
					await api.displayModeAll(mode === 1 ? 0 : 1)
				}),
		},
		toggle_freeze: {
			name: 'Toggle Freeze/Normal',
			options: [],
			callback: () =>
				self.run('Toggle freeze', async (api) => {
					const mode = await currentMode(api)
					await api.displayModeAll(mode === 2 ? 0 : 2)
				}),
		},

		// Restored from v1.0.3 (removed in v2.0.0 without an upgrade script). Same id
		// and option values. Firmware 1.4+ sets working mode per screen through
		// /screen/mode; the old /device/hw/mode route answers "Success" but changes
		// nothing (checked on VMP 1.5.1's controller emulator).
		workingmode: {
			name: 'Working Mode',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Working Mode',
					default: 3,
					choices: [
						{ id: 3, label: 'All-In-One / Advanced' },
						{ id: 2, label: 'Send Only' },
					],
				},
			],
			callback: (event) =>
				self.run('Working mode', async (api) => {
					const workingMode = Number(event.options.mode) === 2 ? 0 : 1
					const screens = (await api.screens())?.screens ?? []
					if (!screens.length) throw new Error('No screens known yet')
					for (const s of screens) await api.screenMode(s, workingMode)
				}),
		},

		preset_screen: {
			name: 'Preset (per screen)',
			description: 'Recalls a preset on the screen it belongs to',
			options: [
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					default: self.screenPresetChoices()[0]?.id ?? '',
					choices: self.screenPresetChoices(),
					allowCustom: true,
				},
			],
			callback: (event) =>
				self.run('Preset', (api) => {
					const [screenID, seq] = String(event.options.preset).split('|')
					if (!screenID || seq === undefined) throw new Error('Choose a preset')
					return api.applyPreset(Number(seq), screenID)
				}),
		},
	}

	self.setActionDefinitions({ ...defs, ...ExtraActions(self) })
}
