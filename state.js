export class ChangeEvent extends Event {
	#final
	constructor(...changes) {
		super('change')
		this.changes = changes
	}
	get final() {
		if (!this.#final) {
			this.#final = new Map(this.changes)
		}
		return this.#final
	}
}

export class MapStorage extends Storage {
	#map = new Map()
	key(index) {
		return [...this.#map.keys()][index]
	}
	getItem(keyName) {
		if (this.#map.has(keyName))
			return this.#map.get(keyName)
		else
			return null
	}
	setItem(keyName, keyValue) {
		this.#map.set(keyName, String(keyValue))
	}
	removeItem(keyName) {
		this.#map.delete(keyName)
	}
	clear() {
		this.#map.clear()
	}
}

export class State extends EventTarget {
	#target
	#options
	#queue

	constructor(target={}, options={}) {
		super()
		this.#options = options
		this.#target = target
		this.proxy = new Proxy(target, {
			set: (_target, prop, value) => {
				this.emit(prop, value)
				this.set(prop, value)
				return true
			},
			get: (_target, prop) => this.get(prop),
		})

		this.addEventListener

		// Try running a "<name>Changed" method for every changed property
		// Can be disabled to maybe squeeze out some performance
		if (options.methods ?? true) {
			this.addEventListener("change", ({final}) => {
				final.forEach((value, prop) => {
					if (`${prop}Changed` in this) this[`${prop}Changed`](value)
				})
			})
		}
	}

	// When you only need one value, you can skip the proxy.
	set value(value) { this.proxy.value = value }
	get value() { return this.proxy.value }

	// Anounces that a prop has changed
	emit(prop, value) {
		if (this.#options.defer ?? true) {
			if (!this.#queue) {
				this.#queue = []
				queueMicrotask(() => {
					this.dispatchEvent(new ChangeEvent(...this.#queue))
					this.#queue = undefined
				})
			}
			this.#queue.push([prop, value])
		} else {
			this.dispatchEvent(new ChangeEvent([prop, value]))
		}
	}

	forward(property="value") {
		return new ForwardState(this, property)
	}

	set(prop, value) {
		this.#target[prop] = value
	}

	get(prop) {
		return this.#target[prop]
	}
}

export class ForwardState extends EventTarget {
	#backend
	#property

	constructor(backend, property) {
		super()
		this.#backend = backend
		this.#property = property
		const ref = new WeakRef(this)
		const abortController = new AbortController()
		backend.addEventListener("change", event => {
			const state = ref.deref()
			if (state) {
				const relevantChanges = event.changes.filter(([name]) => name === property)
				if (relevantChanges.length > 0)
					state.dispatchEvent(new ChangeEvent(relevantChanges))
			} else {
				abortController.abort()
			}
		}, {signal: abortController.signal})
	}

	get value() { return this.#backend.proxy[this.#property] }
	set value(value) { this.#backend.proxy[this.#property] = value }
}

export class StorageChangeEvent extends Event {
	constructor(storage, key, value, targetState) {
		super("storagechange")
		this.storageArea = storage
		this.key = key
		this.newValue = value
		this.targetState = targetState
	}
}

export class StoredState extends State {
	#storage
	#valueKey

	constructor(init, options={}) {
		super({}, options)
		this.#storage = options.storage ?? localStorage ?? new MapStorage()
		this.#valueKey = options.key ?? 'value'

		// Initialise storage from defaults
		for (let [prop, value] of Object.entries(init)) {
			if (prop === 'value') prop = this.#valueKey
			if (this.#storage[prop] === undefined)
				this.set(prop, value)
		}

		// Emit change events for any changed keys
		for (let i=0; i<this.#storage.length; i++) {
			const key = this.#storage.key(i)
			const value = this.#storage[key]
			if (value !== JSON.stringify(init[key]))
				this.emit(key, value)
		}

		// Listen for changes from other windows
		const handler = event => {
			if (event.targetState !== this && event.storageArea == this.#storage) {
				let prop = event.key
				if (prop === this.#valueKey) prop = 'value'
				this.emit(prop, JSON.parse(event.newValue))
			}
		}
		addEventListener("storage", handler)
		addEventListener("storagechange", handler)
	}

	set(prop, value) {
		if (prop == "value") prop = this.#valueKey
		const json = JSON.stringify(value)
		dispatchEvent(new StorageChangeEvent(this.#storage, prop, json, this))
		this.#storage[prop] = json
	}

	get(prop) {
		if (prop == "value") prop = this.#valueKey
		return JSON.parse(this.#storage[prop])
	}
}

export default State
