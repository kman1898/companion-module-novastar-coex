// Offline programming: a simulated COEX controller.
//
// generateOfflineData() builds the same data the poll would fetch from a real
// controller, and OfflineApi stands in for CoexApi: each write changes that data
// the way the controller would, so buttons can be built and tested before the
// show, with feedbacks lighting and variables moving, and nothing is sent.
//
// Screens use positional ids ("#1", "#2"). Real screen ids are GUIDs made up by
// the controller, so positional ids are what keeps offline-built buttons working
// once connected (see resolveScreenId in main.js).

const GAMUTS = ['BT.709', 'BT.2020', 'DCI-P3', 'Native']
const MULTI_MODES = [
	{ modeId: 0, modeName: 'Mode 1' },
	{ modeId: 1, modeName: 'Mode 2' },
]
const CABINETS_PER_SCREEN = 4

const arr = (x) => (Array.isArray(x) ? x : [])

export function generateOfflineData(self) {
	const cfg = self.config || {}
	const nScreens = Math.max(1, Math.min(8, Number(cfg.offlineScreens) || 1))
	const nInputs = Math.max(1, Math.min(16, Number(cfg.offlineInputs) || 4))
	const nPresets = Math.max(0, Math.min(32, Number(cfg.offlinePresets ?? 8)))

	// Every third input has no signal, so both states of the signal feedbacks and
	// variables can be seen offline (as in the H Series module).
	self.inputs = Array.from({ length: nInputs }, (_, i) => ({
		id: i,
		groupId: 100 + i,
		name: `Input ${i + 1}`,
		type: 3,
		sourceStatus: i % 3 === 2 ? 0 : 1,
		actualResolution: { width: 1920, height: 1080 },
		actualRefreshRate: 60,
		bitDepth: 10,
		range: 1,
	}))
	const firstGroup = (i) => self.inputs[i % nInputs].groupId

	const screens = Array.from({ length: nScreens }, (_, i) => ({
		screenID: `#${i + 1}`,
		screenName: `Screen ${i + 1}`,
		workingMode: 1,
		layoutMode: 0,
		lowLatency: false,
		masterFrameRate: 60,
		canvases: [{ canvasID: 2048 + i }],
		layersInWorkingMode: [
			{ workingMode: 0, layers: [{ id: 1, source: firstGroup(i) }] },
			{
				workingMode: 1,
				layers: [
					{ id: 1, source: firstGroup(i) },
					{ id: 2, source: firstGroup(i + 1) },
				],
			},
		],
	}))
	self.screenInfo = { screens }
	self.displayParams = screens.map((s) => ({ screenId: s.screenID, brightness: 1, colorTemperature: 6500, gamma: 2.8 }))
	self.displayState = { displayState: screens.map((s) => ({ canvasID: s.canvases[0].canvasID, displayMode: 0 })) }
	self.presets = screens.flatMap((s) =>
		Array.from({ length: nPresets }, (_, p) => ({
			name: `Preset ${p + 1}`,
			sequenceNumber: p + 1,
			state: false,
			screenID: s.screenID,
		})),
	)

	self.screenOutput = screens.map((s) => ({
		screenID: s.screenID,
		outputBitDepth: { bitDepth: 255, currentBitDepth: 1 },
		currentFrameRate: 60,
		threeD: { enable: false },
		lowDelay: false,
		gamutList: {
			currentGamutName: GAMUTS[0],
			colorGamutInfoList: GAMUTS.map((name) => ({ colorGamutInfo: { targetGamut: { name } } })),
		},
	}))
	self.screenBaseInfo = {
		multiModeInfo: screens.map((s) => ({
			screenID: s.screenID,
			multiModeParam: { currentModeId: 0, modeInfo: MULTI_MODES },
		})),
	}
	self.schedules = screens.map((s) => ({ screenId: s.screenID, enable: false }))
	self.inputData = {
		testPattern: { mode: 0, parameters: { state: 0 } },
		InputPortConfig: self.inputs.map((input) => ({
			logicId: input.id,
			edidInfo: { resolution: { width: 1920, height: 1080 }, refreshRate: 60 },
			hdrParameter: { overrideHdrType: 255, realHdrType: 'SDR' },
			cscParameter: { ContrastValue: 50, SaturationValue: 50, HueValue: 0 },
		})),
	}

	// A healthy controller and wall, so the monitoring variables, feedbacks and
	// presets exist offline. Cabinet ids follow the real 64-bit layout.
	const cabinets = []
	const cabinetList = []
	screens.forEach((s, si) => {
		for (let c = 0; c < CABINETS_PER_SCREEN; c++) {
			const id = ((0x335819n << 32n) | (BigInt(si) << 16n) | BigInt(c)).toString()
			cabinetList.push({ id, brightness: 1, colorTemperature: 6500 })
			cabinets.push({
				CabinetID: si * CABINETS_PER_SCREEN + c + 1,
				temperature: { value: 38, status: 0 },
				voltage: { value: 5, status: 0 },
				rvCards: [
					{
						temperature: { value: 41, status: 0 },
						voltage: { value: 5.1, status: 0 },
						humidity: { value: 30, status: 0 },
						nextCabinetLinkStatus: { linkStatus: true, status: 0 },
					},
				],
			})
		}
	})
	self.cabinetList = cabinetList
	self.monitorInfo = {
		name: 'Virtual controller',
		runtime: 3600,
		totalRuntime: 360000,
		mainBoardTemperature: { value: 45, status: 0 },
		mainBoardVoltage: { value: 11.8, status: 0 },
		backupStatus: { status: 0, errCode: 108 },
		fanInfos: [
			{ fanType: 0, fanSpeed: 1650, status: 0 },
			{ fanType: 3, fanSpeed: 2940, status: 0 },
			{ fanType: 4, fanSpeed: 2820, status: 0 },
		],
		controllerPortMonitorInfos: [
			{ controllerPortID: 0, status: 0 },
			{ controllerPortID: 1, status: 0 },
		],
		cabinets,
	}
	self.deviceInfo = {
		name: 'Virtual controller',
		customName: 'Offline programming',
		hwVersion: 'Offline',
		swVersion: '',
		mode: 3,
	}
	self.backupInfo = {}
	self.audioInfo = { enable: false, source: firstGroup(0) }
	self.snmpInfo = { state: false }
	self.mfCards = []
}

// ---- The simulated controller ----

class OfflineController {
	constructor(self) {
		this.self = self
	}

	screensFor(ids) {
		const all = arr(this.self.screenInfo?.screens)
		if (!ids || !ids.length) return all
		const want = new Set(ids.map(String))
		return all.filter((s) => want.has(String(s.screenID)))
	}
	params(ids) {
		const want = new Set(this.screensFor(ids).map((s) => s.screenID))
		return arr(this.self.displayParams).filter((p) => want.has(p.screenId))
	}
	outputs(ids) {
		const want = new Set(this.screensFor(ids).map((s) => s.screenID))
		return arr(this.self.screenOutput).filter((o) => want.has(o.screenID))
	}
	setDisplayMode(value, ids) {
		const canvases = new Set(this.screensFor(ids).flatMap((s) => arr(s.canvases).map((c) => c.canvasID)))
		for (const d of arr(this.self.displayState?.displayState)) if (canvases.has(d.canvasID)) d.displayMode = value
	}
	currentLayers(screen) {
		const sets = arr(screen.layersInWorkingMode)
		return arr((sets.find((x) => x.workingMode === screen.workingMode) || sets[0])?.layers)
	}

	// ---- Reads: the simulated controller's current data, as the real reads return it ----
	async displayState() {
		return this.self.displayState
	}
	async displayParams() {
		return arr(this.self.displayParams)
	}
	async presetList() {
		return arr(this.self.presets)
	}
	async sources() {
		return arr(this.self.inputs)
	}
	async screens() {
		return this.self.screenInfo
	}
	async screenBaseInfo() {
		return this.self.screenBaseInfo
	}
	async screenOutput() {
		return this.self.screenOutput
	}
	async schedules() {
		return this.self.schedules
	}
	async monitor() {
		return this.self.monitorInfo
	}
	async deviceInfo() {
		return this.self.deviceInfo
	}
	async cabinets() {
		return this.self.cabinetList
	}
	async backup() {
		return this.self.backupInfo
	}
	async audio() {
		return this.self.audioInfo
	}
	async snmp() {
		return this.self.snmpInfo
	}
	async multifunctionCards() {
		return this.self.mfCards
	}
	async inputData() {
		return this.self.inputData
	}

	// ---- Writes the module uses, applied the way the controller applies them ----
	async displayModeAll(value) {
		this.setDisplayMode(Number(value))
	}
	async displayMode(value, screenIdList = []) {
		this.setDisplayMode(Number(value), screenIdList)
	}
	async layerInputGroup(groupId) {
		// Send-Only input: the one layer of every screen in Send-Only mode
		for (const s of this.screensFor()) {
			const set = arr(s.layersInWorkingMode).find((x) => x.workingMode === 0)
			for (const l of arr(set?.layers)) l.source = Number(groupId)
		}
	}
	async applyPreset(sequenceNumber, screenID) {
		for (const p of arr(this.self.presets)) {
			if (p.screenID === screenID) p.state = p.sequenceNumber === Number(sequenceNumber)
		}
	}
	async screenMode(screen, workingMode) {
		const s = this.screensFor([screen.screenID])[0]
		if (s) s.workingMode = Number(workingMode)
	}
	async brightness(brightness, screenIdList) {
		for (const p of this.params(screenIdList)) p.brightness = Number(brightness)
	}
	async colorTemperature(colorTemperature, screenIdList) {
		for (const p of this.params(screenIdList)) p.colorTemperature = Number(colorTemperature)
	}
	async gamma(gamma, screenIdList) {
		for (const p of this.params(screenIdList)) p.gamma = Number(gamma)
	}
	async gamut(name, screenIdList) {
		for (const o of this.outputs(screenIdList)) o.gamutList.currentGamutName = name
	}
	async threeD(enable, screenIdList) {
		for (const o of this.outputs(screenIdList)) o.threeD = { ...o.threeD, enable: !!enable }
	}
	async bitDepth(bitDepth, screenIdList) {
		for (const o of this.outputs(screenIdList)) o.outputBitDepth = { ...o.outputBitDepth, bitDepth: Number(bitDepth) }
	}
	async multiModeScreens(screenIdList, modeId) {
		const want = new Set(this.screensFor(screenIdList).map((s) => s.screenID))
		for (const m of arr(this.self.screenBaseInfo?.multiModeInfo)) {
			if (want.has(m.screenID)) m.multiModeParam.currentModeId = Number(modeId)
		}
	}
	async scheduleOnOff(screenId, enable) {
		for (const s of arr(this.self.schedules)) if (s.screenId === screenId) s.enable = !!enable
	}
	async layerSource(screenID, layers) {
		const s = this.screensFor([screenID])[0]
		if (!s) return
		const current = this.currentLayers(s)
		for (const change of arr(layers)) {
			const l = current.find((x) => x.id === change.id)
			if (l) l.source = change.source
		}
	}
	async testPattern(mode, parameters) {
		this.self.inputData.testPattern = { mode: Number(mode), parameters: { ...parameters } }
	}
	async hdrMode(inputId, hdrMode) {
		const cfg = arr(this.self.inputData?.InputPortConfig).find((p) => p.logicId === Number(inputId))
		if (cfg) cfg.hdrParameter.overrideHdrType = Number(hdrMode)
	}
	async inputSaturation(inputIdList, saturation) {
		this.csc(inputIdList, 'SaturationValue', saturation)
	}
	async inputHue(inputIdList, hue) {
		this.csc(inputIdList, 'HueValue', hue)
	}
	csc(inputIdList, key, value) {
		const want = new Set(arr(inputIdList).map(Number))
		for (const cfg of arr(this.self.inputData?.InputPortConfig)) {
			if (want.has(cfg.logicId)) cfg.cscParameter[key] = Number(value)
		}
	}
	async audioOutput(enable, source) {
		this.self.audioInfo = { enable: !!enable, source: Number(source) }
	}
	async snmpOnOff(state) {
		this.self.snmpInfo = { state: !!state }
	}
	async controllerName(customName) {
		this.self.deviceInfo.customName = customName
	}
}

// Writes the simulation does not model (cabinet tools, EDID, time, identify...)
// succeed without changing anything, as there is nothing on screen to show.
export function createOfflineApi(self) {
	const controller = new OfflineController(self)
	return new Proxy(controller, {
		get(target, key) {
			if (key in target) return target[key]
			// not a thenable: awaiting the api object must not call this
			if (key === 'then' || typeof key !== 'string') return undefined
			return async () => {}
		},
	})
}
