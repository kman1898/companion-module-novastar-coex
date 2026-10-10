import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import UpdateActions from './actions.js'
import UpdateFeedbacks from './feedbacks.js'
import UpdatePresets from './presets.js'
import { CoexApi } from './coexapi.js'
import { PushChannel } from './push.js'
import { generateOfflineData, createOfflineApi } from './offline.js'
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

// How long a brightness we sent stays authoritative over the polled value.
const BRIGHTNESS_SETTLE_MS = 2500

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
		this.brightnessPending = {}
		this.rampTimers = {}
		this.colourPending = { ct: {}, gamma: {} }
		this.writeQueues = {}
		this.target = 'primary'
		this.screenOrders = {}
		this.primaryProbeOk = 0
		this.lastPrimaryProbe = 0
		this.api = null
	}

	// ---- Brightness: stepping, ramping, and holding our value against the poll ----

	// Polled brightness of a screen, 0..1, or undefined
	polledBrightness(screenId) {
		const p = (this.displayParams || []).find((x) => x.screenId === screenId)
		return typeof p?.brightness === 'number' ? p.brightness : undefined
	}

	// The brightness to show and to step from: our own value while a write is in
	// flight (the controller and the poll lag behind it), otherwise the polled one.
	// Without this a held ramp fights the poll and visibly snaps back.
	brightnessFor(screenId) {
		const pending = this.brightnessPending[screenId]
		if (pending) {
			const polled = this.polledBrightness(screenId)
			if (Date.now() < pending.expires && polled !== pending.target) return pending.target
			delete this.brightnessPending[screenId]
		}
		return this.polledBrightness(screenId)
	}

	// Writes of one kind go out one at a time, in press order. Concurrent HTTP
	// requests can overtake each other (seen on the emulator: three quick steps
	// arrived as 5300, 5100, 5200), which would leave the wall on a stale value.
	serialWrite(kind, fn) {
		const run = (this.writeQueues[kind] ?? Promise.resolve()).then(fn, fn)
		this.writeQueues[kind] = run.catch(() => {})
		return run
	}

	// Set brightness (0..1) on screens, remembering it as in flight
	async setBrightness(api, value, screenIds) {
		const v = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
		for (const id of screenIds) this.brightnessPending[id] = { target: v, expires: Date.now() + BRIGHTNESS_SETTLE_MS }
		await this.serialWrite('brightness', () => api.brightness(v, screenIds))
		this.checkVariables()
		this.checkFeedbacks('brightness_compare')
	}

	// One relative step (percent) on each screen, from its in-flight value
	async stepBrightness(api, screenIds, stepPercent) {
		for (const id of screenIds) {
			const cur = this.brightnessFor(id) ?? 1
			const next = Math.max(0, Math.min(100, Math.round(cur * 100) + Number(stepPercent))) / 100
			await this.setBrightness(api, next, [id])
		}
	}

	startRamp(screenIds, stepPercent, everyMs) {
		const key = screenIds.join(',')
		this.stopRamp(key)
		const tick = () => this.stepBrightness(this.api, screenIds, stepPercent).catch(() => this.stopRamp(key))
		tick()
		const started = Date.now()
		this.rampTimers[key] = setInterval(
			() => {
				// Failsafe: stop after 30 s in case a release is ever missed
				if (Date.now() - started > 30000) return this.stopRamp(key)
				const atEnd = screenIds.every((id) => {
					const b = this.brightnessFor(id)
					return stepPercent > 0 ? b >= 1 : b <= 0
				})
				if (atEnd) return this.stopRamp(key)
				tick()
			},
			Math.max(50, Number(everyMs) || 150),
		)
	}

	stopRamp(key) {
		if (key === undefined) {
			for (const k of Object.keys(this.rampTimers)) this.stopRamp(k)
			return
		}
		clearInterval(this.rampTimers[key])
		delete this.rampTimers[key]
	}

	// ---- Colour temperature and gamma steps, same idea as brightness ----

	// kind: 'ct' (Kelvin) or 'gamma'. Our value while a write is in flight, else polled.
	colourFor(kind, screenId) {
		const key = kind === 'ct' ? 'colorTemperature' : 'gamma'
		const p = (this.displayParams || []).find((x) => x.screenId === screenId)
		const polled = typeof p?.[key] === 'number' ? p[key] : undefined
		const pending = this.colourPending[kind][screenId]
		if (pending) {
			if (Date.now() < pending.expires && polled !== pending.target) return pending.target
			delete this.colourPending[kind][screenId]
		}
		return polled
	}

	async setColour(api, kind, value, screenIds) {
		const v = kind === 'ct' ? clampKelvin(value) : clampGamma(value)
		for (const id of screenIds) this.colourPending[kind][id] = { target: v, expires: Date.now() + BRIGHTNESS_SETTLE_MS }
		await this.serialWrite(kind, () => (kind === 'ct' ? api.colorTemperature(v, screenIds) : api.gamma(v, screenIds)))
		this.checkVariables()
		this.checkFeedbacks('colortemp_is', 'gamma_is')
	}

	async stepColour(api, kind, screenIds, step) {
		for (const id of screenIds) {
			const cur = this.colourFor(kind, id) ?? (kind === 'ct' ? 6500 : 2.8)
			await this.setColour(api, kind, cur + Number(step), [id])
		}
	}

	// ---- Display mode per screen (a screen's canvases) ----

	// 0 normal, 1 blackout, 2 freeze; blackout wins over freeze if canvases differ
	screenDisplayMode(screenId) {
		screenId = this.resolveScreenId(screenId)
		const screen = state.screenList(this).find((s) => s.screenID === screenId)
		const canvasIds = new Set((screen?.canvases ?? []).map((c) => c.canvasID))
		const modes = (this.displayState?.displayState ?? [])
			.filter((d) => canvasIds.has(d.canvasID))
			.map((d) => d.displayMode)
		if (!modes.length) return undefined
		if (modes.includes(1)) return 1
		if (modes.includes(2)) return 2
		return 0
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

		if (config?.offline) {
			generateOfflineData(this)
			this.api = createOfflineApi(this)
			this.connectionLabel = 'Offline programming'
			this.setStatus(InstanceStatus.Ok, 'Offline programming (simulated controller, nothing is sent)')
			this.onDataChanged()
			this.log('info', 'Offline programming mode: buttons work against a simulated controller, nothing is sent')
			return
		}

		if (!config || !config.host) {
			this.setStatus(InstanceStatus.BadConfig, 'No controller IP set')
			return
		}

		this.setStatus(InstanceStatus.Connecting)
		this.connectTo('primary')

		// Polling also does the (re)connecting: if the controller is off or
		// rebooting, the status shows a failure and recovers on its own.
		this.pollAll(true).catch(() => {})
		this.pollTimer = setInterval(() => this.pollAll(false).catch(() => {}), this.pollIntervalMs)
	}

	get backupHost() {
		const h = String(this.config?.backupHost ?? '').trim()
		return h && h !== this.config?.host ? h : ''
	}

	// Point the API and the push channel at the primary or the backup controller
	connectTo(target) {
		this.target = target
		const host = target === 'backup' ? this.backupHost : this.config.host
		this.api = new CoexApi(host, this.config.port)
		if (this.push) this.push.stop()
		this.push = null
		if (this.config.usePush !== false) {
			this.push = new PushChannel({
				host,
				port: this.config.port,
				appId: `Companion_${this.id}`,
				onEvent: (ev) => this.onPushEvent(ev),
				log: (level, msg) => this.log(level, msg),
			})
		}
		this.failCount = {}
		this.unsupported.clear()
	}

	// While on the backup, check the primary now and then and go back to it once
	// it has answered three checks in a row (about 30 s), so a flapping primary
	// does not bounce control back and forth.
	async probePrimary() {
		if (this.target !== 'backup' || Date.now() - this.lastPrimaryProbe < 10000) return
		this.lastPrimaryProbe = Date.now()
		try {
			await new CoexApi(this.config.host, this.config.port).displayState()
			this.primaryProbeOk++
		} catch {
			this.primaryProbeOk = 0
		}
		if (this.primaryProbeOk >= 3) {
			this.primaryProbeOk = 0
			this.log('info', `Primary controller ${this.config.host} is answering again, switching back to it`)
			this.connected = false
			this.connectTo('primary')
			this.pollBusy = false
			await this.pollAll(true)
		}
	}

	stopAll() {
		this.stopRamp()
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
		if (!this.api || this.config?.offline || (this.pollBusy && !force)) return
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
					this.unsupported.clear()
					if (this.target === 'backup') {
						this.connectionLabel = 'Connected (backup)'
						this.log('warn', `Connected to the backup controller ${this.backupHost}`)
						this.setStatus(InstanceStatus.UnknownWarning, 'On the backup controller: the primary is not answering')
					} else {
						this.connectionLabel = 'Connected'
						this.log('info', 'Connected to controller')
						this.setStatus(InstanceStatus.Ok)
					}
					if (this.push) this.push.start()
					this.checkVariables()
					// fetch the rest right away instead of waiting for the slow tiers
					this.pollBusy = false
					return this.pollAll(true)
				}

				// Failover: after a failed attempt try the other controller next time.
				// Not when VMP holds the lock: the controller is up, just busy.
				if (fastOk === 0 && !this.connected && this.backupHost && !lockedSeen) {
					const next = this.target === 'primary' ? 'backup' : 'primary'
					this.log('info', `No answer from the ${this.target} controller, trying the ${next}`)
					this.connectTo(next)
				}
			}

			if (changed) this.onDataChanged()
		} finally {
			this.pollBusy = false
		}
		if (this.connected && this.target === 'backup') this.probePrimary().catch(() => {})
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

		// Remember each controller's screen order, so a button made on one of a
		// primary/backup pair finds the same screen on the other (see resolveScreenId)
		const order = state.allScreenIds(this)
		if (this.connected && order.length) this.screenOrders[this.target] = order

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

	// Screen ids in options may be positional ("#1" = first screen). Offline
	// programming mode uses those, because real screen ids are GUIDs the controller
	// makes up; positional ids keep offline-built buttons working once connected.
	resolveScreenId(value) {
		const ids = state.allScreenIds(this)
		const m = /^#(\d+)$/.exec(String(value ?? ''))
		if (m) return ids[Number(m[1]) - 1] ?? value
		if (value === undefined || value === null || ids.includes(value)) return value
		// A screen id from the other controller of a primary/backup pair: the two
		// make up their own screen ids, so match by position.
		for (const order of Object.values(this.screenOrders)) {
			const i = order.indexOf(value)
			if (i >= 0 && ids[i] !== undefined) return ids[i]
		}
		return value
	}

	// Resolve an action's screen option to a screen ID list
	resolveScreens(value) {
		if (!value || value === 'all') return state.allScreenIds(this)
		return [this.resolveScreenId(value)]
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
		if (this.config?.offline) {
			// The simulated controller applies the change; nothing is sent
			try {
				await fn(this.api)
				this.log('debug', `${label}: simulated (offline programming)`)
			} catch (err) {
				this.log('error', `${label} failed: ${errText(err)}`)
			}
			this.onDataChanged()
			return
		}
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
				type: 'textinput',
				id: 'backupHost',
				label: 'Backup controller IP (optional): control switches to it when the primary stops answering',
				width: 12,
				default: '',
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
			{
				type: 'static-text',
				id: 'offline_heading',
				label: 'Offline programming',
				width: 12,
				value:
					'Build and test buttons without a controller. The module simulates a COEX with the screens, inputs and presets below: buttons change the simulated controller, so feedbacks light and variables move as they would on the real one. Nothing is sent. Turn it off to connect; buttons built offline for Screen 1 control the real first screen.',
			},
			{
				type: 'checkbox',
				id: 'offline',
				label: 'Offline programming mode (simulated controller, nothing is sent)',
				width: 12,
				default: false,
			},
			{
				type: 'number',
				id: 'offlineScreens',
				label: 'Virtual screens',
				width: 4,
				default: 1,
				min: 1,
				max: 8,
				isVisibleExpression: '$(options:offline)',
			},
			{
				type: 'number',
				id: 'offlineInputs',
				label: 'Virtual inputs',
				width: 4,
				default: 4,
				min: 1,
				max: 16,
				isVisibleExpression: '$(options:offline)',
			},
			{
				type: 'number',
				id: 'offlinePresets',
				label: 'Virtual presets per screen',
				width: 4,
				default: 8,
				min: 0,
				max: 32,
				isVisibleExpression: '$(options:offline)',
			},
		]
	}
}

// NovaStar's documented ranges. The controller answers Success to values outside
// them: on VMP 1.5.1's emulator a gamma of 5 was ignored, while 1000 K was stored.
function clampKelvin(v) {
	return Math.round(Math.max(1700, Math.min(15000, Number(v) || 6500)))
}
function clampGamma(v) {
	return Math.round(Math.max(1, Math.min(4, Number(v) || 2.8)) * 100) / 100
}

function errText(err) {
	if (!err) return 'unknown error'
	if (typeof err === 'string') return err
	return err.message || err.error || JSON.stringify(err)
}

export { UpgradeScripts }
