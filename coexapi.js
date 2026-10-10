// Client for the NovaStar COEX HTTP API (default port 8001).
// Endpoints and bodies follow https://api.coex.novastar.tech/en/ (COEX 1.5.0).
// Started from Hirte666's client in PR #55; replaces the @novastar-dev/coex library.

// Cabinet ids are 64-bit. JavaScript numbers lose precision above 2^53, so ids are
// read as decimal strings and written back as exact JSON numbers.
function parseExact(text) {
	return JSON.parse(text, (_key, value, context) =>
		typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) ? context.source : value,
	)
}

// A list of ids as exact JSON numbers. Accepts numbers or decimal strings.
export function exactIds(list) {
	return list.map((id) => (typeof id === 'string' && /^\d+$/.test(id) ? JSON.rawJSON(id) : id))
}

// NovaStar's error codes (https://api.coex.novastar.tech/en/, "Error Codes")
const ERROR_CODES = {
	1: 'Invalid parameters',
	2: 'Failed to send',
	3: 'Internal error',
	4: 'Failed to parse data',
	5: 'Device busy',
	6: 'Feature not supported',
	7: 'Parameter length error',
	10: 'Failed to open file',
	11: 'Failed to close file',
	12: 'Readback failed',
	13: 'Failed to create directory',
	14: 'Failed to read file',
	15: 'Failed to decode',
	16: 'Failed to encode',
	17: 'Failed to write file',
	18: 'Request timeout',
	19: 'Response error',
	26: 'Failed to serialize data',
	27: 'Feature conflict due to a conditional restriction',
	29: 'Conflicts with low latency',
	30: 'Conflicts with 3D',
	31: 'Conflicts with genlock',
	32: 'Conflicts with additional frame delay',
	33: 'Conflicts with frame multiplication',
	34: 'Screen Y positions differ, needed for low latency',
	35: 'No screen layout configured',
}

export class CoexError extends Error {
	constructor(message, { code, locked = false } = {}) {
		super(message)
		this.code = code
		this.locked = locked
	}
}

export class CoexApi {
	constructor(host, port) {
		this.host = host
		this.port = Number(port) || 8001
		this.baseurl = `http://${host}:${this.port}`
		this.timeout = 4000
	}

	async request(method, path, body) {
		const headers = { 'Device-Key': `${this.host}:${this.port}` }
		const opts = { method, headers, signal: AbortSignal.timeout(this.timeout) }
		if (body !== undefined) {
			headers['Content-Type'] = 'application/json'
			opts.body = JSON.stringify(body)
		}
		const res = await fetch(this.baseurl + path, opts)
		const text = await res.text()
		let data
		try {
			data = parseExact(text)
		} catch {
			throw new CoexError(`${method} ${path}: HTTP ${res.status}, no JSON`)
		}
		if (data && typeof data === 'object' && 'code' in data) {
			if (data.code && data.code !== 0 && data.code !== 200) {
				const known = ERROR_CODES[data.code]
				const msg = (data.message || `code ${data.code}`) + (known && known !== data.message ? ` (${known})` : '')
				const locked = data.message === 'device locked'
				throw new CoexError(
					`${method} ${path}: ${msg}${locked ? ' (VMP is connected to this controller; close VMP to control it from Companion)' : ''}`,
					{ code: data.code, locked },
				)
			}
			return data.data
		}
		if (!res.ok) throw new CoexError(`${method} ${path}: HTTP ${res.status}`)
		return data
	}

	get(path) {
		return this.request('GET', path)
	}
	put(path, body) {
		return this.request('PUT', path, body)
	}
	post(path, body) {
		return this.request('POST', path, body)
	}

	// ---- Reads ----
	displayState() {
		return this.get('/api/v1/screen/output/display/state')
	}
	async displayParams() {
		const d = await this.get('/api/v1/screen/displayparams')
		return Array.isArray(d) ? d : (d?.list ?? [])
	}
	// All presets with their screen, flattened: [{ ...preset, screenID }]
	async presetList() {
		const d = await this.get('/api/v1/preset')
		if (Array.isArray(d)) return d
		const out = []
		for (const sp of d?.screenPresets ?? []) {
			for (const p of sp.presets ?? []) out.push({ ...p, screenID: p.screenID ?? sp.screenID })
		}
		return out
	}
	async sources() {
		const d = await this.get('/api/v1/device/input/sources')
		return Array.isArray(d) ? d : []
	}
	screens() {
		return this.get('/api/v1/screen')
	}
	screenBaseInfo() {
		return this.get('/api/v1/screen/base/info')
	}
	screenOutput() {
		return this.get('/api/v1/screen/output')
	}
	schedules() {
		return this.get('/api/v1/screen/schedule/all')
	}
	monitor() {
		return this.get('/api/v1/device/monitor/info?isNeedCabinetInfo=0')
	}
	deviceInfo() {
		return this.get('/api/v1/device/hw')
	}
	cabinets() {
		return this.get('/api/v1/device/cabinet')
	}
	backup() {
		return this.get('/api/v1/device/backup')
	}
	audio() {
		return this.get('/api/v1/device/audio')
	}
	snmp() {
		return this.get('/api/v1/device/snmpstate')
	}
	multifunctionCards() {
		return this.get('/api/v1/device/multifunc-card/detailinfo')
	}
	inputData() {
		return this.get('/api/v1/device/input')
	}

	// ---- The original module's calls, same requests the library sent ----
	// Display mode on every screen: PUT /screen/output/displaymode {value}
	displayModeAll(value) {
		return this.put('/api/v1/screen/output/displaymode', { value })
	}
	// Input for Send-Only mode: PUT /screen/layer/input {groupId}
	layerInputGroup(groupId) {
		return this.put('/api/v1/screen/layer/input', { groupId })
	}
	// Preset recall: POST /preset/current/update {sequenceNumber, screenID}
	applyPreset(sequenceNumber, screenID) {
		return this.post('/api/v1/preset/current/update', { sequenceNumber, screenID })
	}
	// Working mode per screen (0 Send-Only, 1 All-In-One). VMP sends the screen's
	// other mode fields with it, so the caller passes them through unchanged.
	screenMode(screen, workingMode) {
		const body = { screenID: screen.screenID, workingMode }
		for (const k of ['layoutMode', 'lowLatency', 'outputMode']) if (screen[k] !== undefined) body[k] = screen[k]
		return this.put('/api/v1/screen/mode', body)
	}

	// ---- Screen / output ----
	displayMode(value, screenIdList = []) {
		return this.put('/api/v1/screen/output/displaymode', { value, screenIdList })
	}
	brightness(brightness, screenIdList) {
		return this.put('/api/v1/screen/brightness', { screenIdList, brightness })
	}
	colorTemperature(colorTemperature, screenIdList) {
		return this.put('/api/v1/screen/colortemperature', { screenIdList, colorTemperature })
	}
	gamma(gamma, screenIdList) {
		return this.put('/api/v1/screen/gamma', { screenIdList, gamma })
	}
	brightnessLimitOnOff(state, screenIdList) {
		return this.post('/api/v1/screen/output/max-brightness', { screenIdList, type: 1, state })
	}
	brightnessLimitValue(screenIdList, type, nit, ratio) {
		return this.post('/api/v1/screen/output/max-brightness', { screenIdList, type, nit, ratio })
	}
	gamut(name, screenIdList) {
		return this.put('/api/v1/screen/output/gamut', { name, screenIdList })
	}
	lut3dEnable(enable, screenIdList) {
		return this.put('/api/v1/screen/processing/threedlut/enable', { screenIdList, enable })
	}
	lut3dStrength(strength, screenIdList) {
		return this.put('/api/v1/screen/processing/threedlut/strength', { screenIdList, strength })
	}
	colorCorrection(enable, screenIdList) {
		return this.put('/api/v1/screen/processing/colorcorrect/enable', { enable, screenIdList })
	}
	scheduleOnOff(screenId, enable) {
		return this.post('/api/v1/screen/schedule/enable/update', { screenId, enable })
	}
	layerSource(screenID, layers) {
		return this.put('/api/v1/screen/layer/input', { screenID, layers })
	}
	multiModeScreens(screenIdList, modeId) {
		return this.put('/api/v1/screen/output/multimode', { screenIdList, modeId })
	}
	bitDepth(bitDepth, screenIdList) {
		return this.put('/api/v1/screen/output/bitdepth', { screenIdList, bitDepth })
	}
	syncSource(selectSource, screenIdList) {
		return this.put('/api/v1/screen/output/sync/source', { screenIdList, selectSource })
	}
	threeD(enable, screenIdList) {
		return this.put('/api/v1/screen/output/threed/enable', { screenIdList, enable })
	}
	threeDEmitter(enable, screenIdList) {
		return this.put('/api/v1/screen/output/threed/emitter', { Enable: enable, screenIdList })
	}

	// ---- Input ----
	inputShadow(inputIdList, type, shadow) {
		return this.put('/api/v1/device/input/shadow', { inputIdList, type, shadow })
	}
	inputHighlight(inputIdList, type, highLight) {
		return this.put('/api/v1/device/input/highlight', { inputIdList, type, highLight })
	}
	inputSaturation(inputIdList, saturation) {
		return this.put('/api/v1/device/input/saturation', { inputIdList, saturation })
	}
	inputHue(inputIdList, hue) {
		return this.put('/api/v1/device/input/hue', { inputIdList, hue })
	}
	inputReset(inputIdList) {
		return this.put('/api/v1/device/input/reset', { inputIdList, type: 0 })
	}
	edid(inputId, width, height, refreshRate, isCustom) {
		return this.put(`/api/v1/device/input/${inputId}/edid`, {
			para: { resolution: { width, height }, refreshRate, isCustom },
		})
	}
	hdrMode(inputId, hdrMode) {
		return this.put(`/api/v1/device/input/${inputId}/hdrmode`, { hdrMode })
	}
	internalSource(width, height, refreshrate, bitdepth, isEdidCustom) {
		return this.put('/api/v1/device/input/internalsource', { width, height, refreshrate, bitdepth, isEdidCustom })
	}
	testPattern(mode, parameters) {
		return this.put('/api/v1/device/input/pattern/test', { mode, parameters })
	}

	// ---- Device ----
	audioOutput(enable, source) {
		return this.post('/api/v1/device/audio', { enable, source })
	}
	colorBeacon(enable, color) {
		return this.post('/api/v1/device/hw/colorBeacon', { enable, color })
	}
	deviceIdentify(enable) {
		return this.put('/api/v1/device/hw/mapping', { enable })
	}
	backupVerify(screenID, verifyType) {
		return this.post('/api/v1/device/backup/verify', { screenID, verifyType })
	}
	systemTime(d, isUTC) {
		return this.put('/api/v1/device/hw/systemtime', {
			year: d.year,
			month: d.month,
			day: d.day,
			hour: d.hour,
			minute: d.minute,
			second: d.second,
			isUTC,
		})
	}
	autoTime(enable, timeSource) {
		return this.put('/api/v1/device/time/enable', { enable, timeSource })
	}
	timezone(timezone) {
		return this.post('/api/v1/device/timezone', { timezone })
	}
	controllerName(customName) {
		return this.put('/api/v1/device/hw/customname', { customName })
	}
	snmpOnOff(state) {
		return this.put('/api/v1/device/snmpstate', { state })
	}

	// ---- Cabinets (receiving cards); idList entries are exact 64-bit ids ----
	noDataSignal(idList, prestoreImageType) {
		return this.put('/api/v1/device/cabinet/prestoreimage', {
			idList: exactIds(idList),
			abnormalMode: 1,
			prestoreImageType,
		})
	}
	thermalOnOff(idList, enable) {
		return this.put('/api/v1/device/correctionop/cabinets/thermacal/enable', { idList: exactIds(idList), enable })
	}
	thermalAmount(idList, amount) {
		return this.put('/api/v1/device/correctionop/cabinets/thermacal/amount', { idList: exactIds(idList), amount })
	}
	thermalMode(idList, mode) {
		return this.put('/api/v1/device/correctionop/cabinets/thermacal/mode', { idList: exactIds(idList), mode })
	}
	cabinetRgbBrightness(idList, r, g, b) {
		return this.put('/api/v1/device/cabinet/rgb/brightness', { idList: exactIds(idList), r, g, b })
	}
	cabinetBrightness(idList, ratio, nit) {
		const body = { idList: exactIds(idList), ratio }
		if (nit !== undefined && nit !== null && nit !== '') body.nit = nit
		return this.put('/api/v1/device/cabinet/brightness', body)
	}
	cabinetColorTemperature(idList, value) {
		return this.put('/api/v1/device/cabinet/colortemperature', { idList: exactIds(idList), value })
	}
	cabinetTestPattern(idList, testmode) {
		return this.put('/api/v1/device/cabinet/testpattern', { idList: exactIds(idList), testmode })
	}
	cabinetMapping(idList, enable) {
		return this.put('/api/v1/device/cabinet/mapping', { idList: exactIds(idList), enable })
	}
	cabinetMultiMode(idList, modeId) {
		return this.put('/api/v1/device/cabinet/multimode', { idList: exactIds(idList), modeId })
	}
	cabinetRgbw(idList, changeType, value) {
		return this.post('/api/v1/device/cabinet/rgbwbrightness', { idList: exactIds(idList), changeType, value })
	}
}
