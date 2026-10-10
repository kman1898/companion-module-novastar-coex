import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import UpdateActions from './actions.js'
import UpdateFeedbacks from './feedbacks.js'
import UpdatePresets from './presets.js'
import { CoexApi } from './coexapi.js'
import { PushChannel } from './push.js'
import * as state from './state.js'

// What gets polled how often. "every" is in poll ticks; "everyMs" is converted to
// ticks from the configured interval. "fast" endpoints decide the connection status.
const POLLS = [
	{ key: 'displayState', every: 1, fast: true, fn: (s) => s.api.displayState() },
	{ key: 'displayParams', every: 1, fast: true, fn: (s) => s.api.displayParams() },
	{ key: 'presets', every: 1, fast: true, fn: (s) => s.api.presetList() },
	{ key: 'inputs', every: 2, fn: (s) => s.api.sources() },
	{ key: 'screenInfo', every: 2, fn: (s) => s.api.screens() },
	{ key: 'monitorInfo', everyMs: 5000, monitor: true, fn: (s) => s.api.monitor() },
	{ key: 'screenOutput', everyMs: 5000, fn: (s) => s.api.screenOutput() },
	{ key: 'inputData', everyMs: 5000, fn: (s) => s.api.inputData() },
	{ key: 'screenBaseInfo', everyMs: 5000, fn: (s) => s.api.screenBaseInfo() },
	{ key: 'schedules', everyMs: 5000, fn: (s) => s.api.schedules() },
	{ key: 'backupInfo', everyMs: 5000, fn: (s) => s.api.backup() },
	{ key: 'audioInfo', everyMs: 5000, fn: (s) => s.api.audio() },
	{ key: 'snmpInfo', everyMs: 10000, fn: (s) => s.api.snmp() },
	{ key: 'mfCards', everyMs: 10000, fn: (s) => s.api.multifunctionCards() },
	{ key: 'deviceInfo', everyMs: 30000, fn: (s) => s.api.deviceInfo() },
	{ key: 'cabinetList', everyMs: 30000, fn: (s) => s.api.cabinets() },
]

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.pollTimer = null
		this.push = null
		this.pushRefreshTimer = null
		this.resetState()
	}

	resetState() {
		for (const p of POLLS) this[p.key] = null
		this.displayParams = []
		this.presets = []
		this.inputs = []
		this.sourcelist = []
		this.presetlist = []
		this.currentPresetName = 'Not Activated'
		this.pollCount = 0
		this.pollBusy = false
		this.failCount = {}
		this.unsupported = new Set()
		this.connected = false
		this.locked = false
		this.connectionLabel = 'Disconnected'
		this.listSignature = ''
		this.variableIdSignature = ''
	}

	get pollIntervalMs() {
		return Math.max(200, parseInt(this.config?.pollInterval) || 500)
	}

	async init(config) {
		this.config = config
		this.stopAll()
		this.resetState()

		this.updateDefinitions()
		this.checkVariables()

		if (!config || !config.host) {
			this.setStatus(InstanceStatus.BadConfig, 'No controller IP set')
			return
		}

		this.setStatus(InstanceStatus.Connecting)
		this.api = new CoexApi(config.host, config.port)
		if (config.usePush !== false) {
			this.push = new PushChannel({
				host: config.host,
				port: config.port,
				appId: `Companion_${this.id}`,
				onEvent: (ev) => this.onPushEvent(ev),
				log: (level, msg) => this.log(level, msg),
			})
		}

		// Polling also does the (re)connecting: if the controller is off or
		// rebooting, the status shows a failure and recovers on its own.
		this.pollAll(true).catch(() => {})
		this.pollTimer = setInterval(() => this.pollAll(false).catch(() => {}), this.pollIntervalMs)
	}

	stopAll() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
		clearTimeout(this.pushRefreshTimer)
		this.pushRefreshTimer = null
		if (this.push) this.push.stop()
		this.push = null
	}

	// Only report a status when it changes; every updateStatus call is logged.
	setStatus(status, message) {
		const key = `${status}|${message ?? ''}`
		if (key === this.lastStatusKey) return
		this.lastStatusKey = key
		this.updateStatus(status, message)
	}

	// Any change the controller pushes: refresh soon, coalescing bursts.
	onPushEvent(ev) {
		if (ev.eventType === 'deviceLastOperatorChange') return
		if (this.pushRefreshTimer) return
		this.pushRefreshTimer = setTimeout(() => {
			this.pushRefreshTimer = null
			this.pollAll(true).catch(() => {})
		}, 100)
	}

	async pollAll(force) {
		if (!this.api || (this.pollBusy && !force)) return
		this.pollBusy = true
		try {
			const n = this.pollCount++
			// While disconnected only try the fast endpoints, every ~2 s
			if (!this.connected && !force && n % Math.max(1, Math.round(2000 / this.pollIntervalMs)) !== 0) return

			const due = POLLS.filter((p) => {
				if (p.monitor && this.config.pollMonitor === false) return false
				if (this.unsupported.has(p.key)) return false
				if (!this.connected && !p.fast) return false
				const every = p.every || Math.max(1, Math.round(p.everyMs / this.pollIntervalMs))
				return force || n % every === 0
			})

			let changed = false
			let fastOk = 0
			let fastTried = 0
			let lockedSeen = false
			await Promise.all(
				due.map(async (p) => {
					if (p.fast) fastTried++
					try {
						const data = await p.fn(this)
						this.failCount[p.key] = 0
						if (p.fast) fastOk++
						if (!same(data, this[p.key])) {
							this[p.key] = data
							changed = true
						}
					} catch (err) {
						if (err?.locked) lockedSeen = true
						const count = (this.failCount[p.key] || 0) + 1
						this.failCount[p.key] = count
						// An optional endpoint that keeps failing while the controller is
						// reachable is most likely not supported by this firmware.
						if (!p.fast && this.connected && count >= 3 && !err?.locked) {
							this.unsupported.add(p.key)
							this.log('info', `${p.key}: not available on this controller/firmware, polling stopped (${errText(err)})`)
						} else if (count === 1 && this.connected) {
							this.log('warn', `Polling ${p.key} failed: ${errText(err)}`)
						}
					}
				}),
			)

			if (fastTried > 0) {
				if (fastOk === 0 && (this.connected || force)) {
					if (this.connected) this.log('error', 'Connection to controller lost')
					this.connected = false
					if (this.push) this.push.stop()
					if (lockedSeen) {
						this.connectionLabel = 'Locked by VMP'
						this.setStatus(InstanceStatus.UnknownWarning, 'Locked by VMP: close VMP to control from Companion')
					} else {
						this.connectionLabel = 'Disconnected'
						this.setStatus(InstanceStatus.ConnectionFailure, 'No response from controller')
					}
					this.checkVariables()
					this.checkAllFeedbacks()
				} else if (fastOk > 0 && !this.connected) {
					this.connected = true
					this.locked = false
					this.connectionLabel = 'Connected'
					this.unsupported.clear()
					this.log('info', 'Connected to controller')
					this.setStatus(InstanceStatus.Ok)
					if (this.push) this.push.start()
					// fetch the rest right away instead of waiting for the slow tiers
					this.pollBusy = false
					return this.pollAll(true)
				}
			}

			if (changed) this.onDataChanged()
		} finally {
			this.pollBusy = false
		}
	}

	// Called after any polled data changed
	onDataChanged() {
		this.presets = Array.isArray(this.presets) ? this.presets : []
		this.displayParams = Array.isArray(this.displayParams) ? this.displayParams : []
		this.inputs = Array.isArray(this.inputs) ? this.inputs : []

		// The original preset action and current_preset_name work on the first
		// screen, as the original module did.
		const firstScreen = state.allScreenIds(this)[0]
		const firstPresets = firstScreen === undefined ? this.presets : state.presetsForScreen(this, firstScreen)
		const active = firstPresets.find((p) => p.state === true)
		this.currentPresetName = active ? active.name : 'Not Activated'
		this.sourcelist = this.inputs.map((s) => ({ id: s.name, label: s.name }))
		this.presetlist = firstPresets.map((p) => ({ id: p.name, label: p.name }))

		// Dropdown contents changed -> rebuild actions/feedbacks/presets
		const sig = JSON.stringify([
			this.sourcelist,
			this.presetlist,
			this.screenPresetChoices(),
			this.screenChoices(),
			this.layerChoices(),
			state.gamutNames(this),
			state.multiModes(this),
		])
		if (sig !== this.listSignature) {
			this.listSignature = sig
			this.updateDefinitions()
		}

		this.checkVariables()
		this.checkAllFeedbacks()
	}

	updateDefinitions() {
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
	}

	checkVariables() {
		const vars = state.buildVariables(this)
		const sig = vars.map((v) => v.id).join('|')
		if (sig !== this.variableIdSignature) {
			this.variableIdSignature = sig
			const defs = {}
			for (const v of vars) defs[v.id] = { name: v.name }
			this.setVariableDefinitions(defs)
		}
		const values = {}
		vars.forEach((v) => (values[v.id] = v.value))
		this.setVariableValues(values)
	}

	// ---- Choice helpers used by actions / feedbacks / presets ----

	screenChoices(withAll = false) {
		const screens = state.screenList(this)
		const list = screens.length
			? screens.map((s, i) => ({ id: s.screenID, label: s.screenName || `Screen ${i + 1}` }))
			: state.allScreenIds(this).map((id, i) => ({ id, label: `Screen ${i + 1}` }))
		return withAll ? [{ id: 'all', label: 'All screens' }, ...list] : list
	}

	// Presets of every screen: id "<screenID>|<sequenceNumber>"
	screenPresetChoices() {
		const screens = this.screenChoices()
		const out = []
		for (const s of screens) {
			for (const p of state.presetsForScreen(this, s.id)) {
				out.push({ id: `${s.id}|${p.sequenceNumber}`, label: `${s.label}: ${p.name}` })
			}
		}
		return out
	}

	layerChoices() {
		const out = []
		state.screenList(this).forEach((s, si) => {
			state.screenLayers(s).forEach((l, li) => {
				out.push({ id: `${s.screenID}|${l.id}`, label: `${s.screenName || `Screen ${si + 1}`}: Layer ${li + 1}` })
			})
		})
		return out
	}

	inputIdChoices(withAll = false) {
		const list = this.inputs.map((s) => ({ id: String(s.id), label: s.name || `Input ${s.id}` }))
		return withAll ? [{ id: 'all', label: 'All inputs' }, ...list] : list
	}

	inputGroupChoices() {
		return this.inputs.map((s) => ({ id: String(s.groupId), label: s.name || `Group ${s.groupId}` }))
	}

	// Resolve an action's screen option to a screen ID list
	resolveScreens(value) {
		if (!value || value === 'all') return state.allScreenIds(this)
		return [value]
	}

	// Resolve an input option ('all' or an id) to an input ID list
	resolveInputs(value) {
		if (!value || value === 'all') return this.inputs.map((i) => i.id)
		return [Number(value)]
	}

	// Cabinet IDs: blank = all configured cabinets, otherwise comma separated IDs.
	// Kept as decimal strings: they are 64-bit and lose precision as JS numbers.
	resolveCabinets(text) {
		const t = String(text ?? '').trim()
		if (!t || t.toLowerCase() === 'all')
			return (Array.isArray(this.cabinetList) ? this.cabinetList : []).map((c) => String(c.id))
		return t.split(/[\s,;]+/).filter((s) => /^\d+$/.test(s))
	}

	// Run an API call from an action, log errors, and refresh state soon after
	async run(label, fn) {
		if (!this.api) {
			this.log('warn', `${label}: not connected`)
			return
		}
		try {
			await fn(this.api)
			this.log('debug', `${label}: OK`)
			if (this.locked) {
				this.locked = false
				if (this.connected) this.setStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			this.log('error', `${label} failed: ${errText(err)}`)
			if (err?.locked) {
				this.locked = true
				this.setStatus(InstanceStatus.UnknownWarning, 'Locked by VMP: close VMP to control from Companion')
			}
		}
		setTimeout(() => this.pollAll(true).catch(() => {}), 300)
	}

	async destroy() {
		this.stopAll()
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.log('info', 'Reloading config')
		await this.init(config)
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Controller IP',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'API port',
				width: 4,
				regex: Regex.PORT,
				default: '8001',
			},
			{
				type: 'number',
				id: 'pollInterval',
				label: 'Poll interval (ms)',
				width: 4,
				default: 500,
				min: 200,
				max: 10000,
			},
			{
				type: 'checkbox',
				id: 'pollMonitor',
				label: 'Poll hardware / cabinet monitoring (every ~5 s)',
				width: 8,
				default: true,
			},
			{
				type: 'checkbox',
				id: 'usePush',
				label: 'Instant updates from the controller (push channel; polling continues as a fallback)',
				width: 12,
				default: true,
			},
		]
	}
}

function errText(err) {
	if (!err) return 'unknown error'
	if (typeof err === 'string') return err
	return err.message || err.error || JSON.stringify(err)
}

export { UpgradeScripts }
