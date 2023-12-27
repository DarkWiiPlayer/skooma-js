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
	#forwardCache

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

	forward(property="value", fallback) {
		if (!this.#forwardCache) this.#forwardCache = new Map()
		const cached = this.#forwardCache.get(property)?.deref()
		if (cached) {
			return cached
		} else {
			const forwarded = new ForwardState(this, property, fallback)
			const ref = new WeakRef(forwarded)
			this.#forwardCache.set(property, ref)
			forwardFinalizationRegistry.register(forwarded, [this.#forwardCache, property])
			return forwarded
		}
	}

	set(prop, value) {
		this.#target[prop] = value
	}

	get(prop) {
		return this.#target[prop]
	}
}

const forwardFinalizationRegistry = new FinalizationRegistry(([cache, name]) => {
	cache.remove(name)
})

export class ForwardState extends EventTarget {
	#backend
	#property
	#fallback

	constructor(backend, property, fallback) {
		super()
		this.#backend = backend
		this.#property = property
		this.#fallback = fallback
		const ref = new WeakRef(this)
		const abortController = new AbortController()
		backend.addEventListener("change", event => {
			const state = ref.deref()
			if (state) {
				const relevantChanges = event.changes
					.filter(([name]) => name === property)
					.map(([_, value]) => ["value", value])
				if (relevantChanges.length > 0)
					state.dispatchEvent(new ChangeEvent(...relevantChanges))
			} else {
				abortController.abort()
			}
		}, {signal: abortController.signal})
	}

	get value() { return this.#backend.proxy[this.#property] ?? this.#fallback }
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
		const value = this.#storage[prop]
		return value && JSON.parse(value)
	}
}

const attributeObserver = new MutationObserver(mutations => {
	for (const {type, target, attributeName: name} of mutations) {
		if (type == "attributes") {
			const next = target.getAttribute(name)
			if (target.state.proxy[name] !== next)
				target.state.proxy[name] = next
		}
	}
})

export const component = (generator, name) => {
	name = name ?? generator.name.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`)
	customElements.define(name, class extends HTMLElement{
		constructor() {
			super()
			this.state = new State(Object.fromEntries([...this.attributes].map(attribute => [attribute.name, attribute.value])))
			this.state.addEventListener("change", event => {
				for (const [name, value] of event.changes) {
					if (this.getAttribute(name) !== value)
						this.setAttribute(name, value)
				}
			})
			attributeObserver.observe(this, {attributes: true})
			this.replaceChildren(generator(this.state))
		}
	})
}

export default State
