// COEX push channel. The controller firmware serves a WebSocket at
// /api/v1/websocketchannel: the client sends its application id as plain text and
// the controller then pushes {eventSender, eventType, eventData} whenever state
// changes (display mode, inputs, presets, monitoring...). It is not in NovaStar's
// public API docs; it was found in VMP's traffic and confirmed against VMP's own
// controller emulator. Polling stays the source of truth: push only makes updates
// arrive sooner, and the module works the same without it.

const RECONNECT_MS = 5000

export class PushChannel {
	constructor({ host, port, appId, onEvent, log }) {
		this.url = `ws://${host}:${Number(port) || 8001}/api/v1/websocketchannel`
		this.appId = appId
		this.onEvent = onEvent
		this.log = log
		this.ws = null
		this.timer = null
		this.stopped = true
		this.open = false
	}

	start() {
		this.stopped = false
		this.connect()
	}

	stop() {
		this.stopped = true
		clearTimeout(this.timer)
		this.timer = null
		if (this.ws) {
			try {
				this.ws.close()
			} catch {
				// already closed
			}
		}
		this.ws = null
		this.open = false
	}

	connect() {
		if (this.stopped || this.ws) return
		let ws
		try {
			ws = new WebSocket(this.url)
		} catch (err) {
			this.log('debug', `Push channel: ${err.message}`)
			this.retry()
			return
		}
		this.ws = ws
		ws.onopen = () => {
			this.open = true
			ws.send(this.appId)
			this.log('debug', 'Push channel open')
		}
		ws.onmessage = (m) => {
			let ev
			try {
				ev = JSON.parse(String(m.data))
			} catch {
				return
			}
			if (ev && ev.eventType) this.onEvent(ev)
		}
		ws.onerror = () => {
			// onclose follows and schedules the retry
		}
		ws.onclose = () => {
			if (this.open) this.log('debug', 'Push channel closed')
			this.open = false
			this.ws = null
			this.retry()
		}
	}

	retry() {
		if (this.stopped || this.timer) return
		this.timer = setTimeout(() => {
			this.timer = null
			this.connect()
		}, RECONNECT_MS)
	}
}
