const abortRegistry = new FinalizationRegistry(controller => controller.abort())

const camelToKebab = string => string.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`)
const kebabToCamel = string => string.replace(/([a-z])-([a-z])/g, (_, a, b) => a+b.toUpperCase())

export class ChangeEvent extends Event {
	#final
	#values
	constructor(...changes) {
		super('change')
		this.changes = changes
	}

	get values() {
		if (!this.#values) {
			const values = new Map()
			for (const {property, from, to} of this.changes) {
				let list = values.get(property)
				if (!list) {
					list = [from]
					values.set(property, list)
				}
				list.push(to)
			}
			this.#values = values
		}
		return this.#values
	}

	get final() {
		if (!this.#final) {
			this.#final = new Map()
			for (const [property, list] of this.values) {
				if (list[0] !== list[list.length-1]) {
					this.#final.set(property, list[list.length-1])
				}
			}
		}
		return this.#final
	}
}

export class SimpleState extends EventTarget {
	#synchronous
	#queue
	#nested = new Map()
	#weakRef = new WeakRef(this)
	#abortController = new AbortController

	constructor({synchronous, methods}={}) {
		super()
		this.#synchronous = !!synchronous
		abortRegistry.register(this, this.#abortController)

		// Try running a "<name>Changed" method for every changed property
		// Can be disabled to maybe squeeze out some performance
		if (methods ?? true) {
			this.addEventListener("change", ({final}) => {
				final.forEach((value, prop) => {
					if (`${prop}Changed` in this) this[`${prop}Changed`](value)
				})
			})
		}
	}

	subscribe(prop, callback) {
		if (!callback) return this.subscribe("value", prop)

		const controller = new AbortController()
		this.addEventListener("change", ({final}) => {
			if (final.has(prop)) return callback(final.get(prop))
		}, {signal: controller.signal})
		callback(this.value)
		return () => controller.abort()
	}

	get() { return this.value }
	set(value) { this.value = value }

	emit(property, from, to, options={}) {
		const change = {property, from, to, ...options}
		if (!this.synchronous) {
			if (!this.#queue) {
				this.#queue = []
				queueMicrotask(() => {
					this.dispatchEvent(new ChangeEvent(...this.#queue))
					this.#queue = undefined
				})
			}
			this.#queue.push(change)
		} else {
			this.dispatchEvent(new ChangeEvent([change]))
		}
	}

	adopt(prop, state) {
		let handlers = this.#nested.get(state)
		if (!handlers) {
			// Actual adoption
			handlers = new Map()
			this.#nested.set(state, handlers)
		}
		const ref = this.#weakRef
		const handler = () => ref.deref()?.emit(prop, state, state, {state: true})

		handlers.set(prop, handler)
		state.addEventListener("change", handler, {signal: this.ignal})
	}

	disown(prop, state) {
		const handlers = this.#nested.get(state)
		const handler = handlers.get(prop)
		state.removeEventListener("change", handler)
		handlers.delete(prop)
		if (handlers.size == 0) {
			this.#nested.delete(state)
		}
	}

	get signal() { return this.#abortController.signal }
	get synchronous() { return this.#synchronous }
}

export class State extends SimpleState {
	#target
	#shallow

	static isState(object) { return SimpleState.prototype.isPrototypeOf(object) }

	constructor(target={}, {shallow, ...options}={}) {
		super(options)

		this.#shallow = !!shallow
		this.#target = target
		this.values = new Proxy(target, {
			set: (_target, prop, value) => {
				const old = this.get(prop)
				if (old !== value) {
					this.emit(prop, old, value)
					if (this.#shallow) {
						if (State.isState(old)) this.disown(prop, old)
						if (State.isState(value)) this.adopt(prop, value)
					}
					this.set(prop, value)
				}
				return true
			},
			get: (_target, prop) => this.get(prop),
		})
	}

	forward(property="value", methods) {
		return new ForwardState(this, property, methods)
	}

	set(prop, value) {
		if (arguments.length === 1) return this.set("value", prop)
		this.#target[prop] = value
	}

	get(prop="value") {
		return this.#target[prop]
	}

	set value(value) { this.set(value) }
	get value() { return this.get() }
}

export class ForwardState extends SimpleState {
	#backend
	#property
	#methods

	constructor(backend, property, methods = {}) {
		super()
		this.#methods = methods
		this.#backend = backend
		this.#property = property

		const ref = new WeakRef(this)
		const abortController = new AbortController()
		abortRegistry.register(this, abortController)
		backend.addEventListener("change", event => {
			const state = ref.deref()
			if (state) {
				let relevantChanges = event.changes
					.filter(({property: name}) => name === property)
				const get = methods.get
				if (methods.get) {
					relevantChanges = relevantChanges.map(
						({from, to}) => ({property: "value", from: get(from), to: get(to)})
					)
				} else {
					relevantChanges = relevantChanges.map(
						({from, to}) => ({property: "value", from, to})
					)
				}
				if (relevantChanges.length > 0)
					state.dispatchEvent(new ChangeEvent(...relevantChanges))
			} else {
				abortController.abort()
			}
		}, {signal: abortController.signal})
	}

	get value() {
		const methods = this.#methods
		if (methods.get) {
			return methods.get(this.#backend.values[this.#property])
		} else {
			return this.#backend.values[this.#property]
		}
	}

	set value(value) {
		const methods = this.#methods
		if (methods.set) {
			this.#backend.values[this.#property] = methods.set(value)
		} else {
			this.#backend.values[this.#property] = value
		}
	}
}

class StorageChangeEvent extends Event {
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

	constructor(init, options={}) {
		super({}, options)
		this.#storage = options.storage ?? localStorage ?? new MapStorage()

		// Initialise storage from defaults
		for (const [prop, value] of Object.entries(init)) {
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
				this.emit(event.key, JSON.parse(event.newValue))
			}
		}
		addEventListener("storage", handler)
		addEventListener("storagechange", handler)
	}

	set(prop, value) {
		const json = JSON.stringify(value)
		dispatchEvent(new StorageChangeEvent(this.#storage, prop, json, this))
		this.#storage[prop] = json
	}

	get(prop) {
		const value = this.#storage[prop]
		return value && JSON.parse(value)
	}
}

const attributeObserver = new MutationObserver(mutations => {
	for (const {type, target, attributeName: name} of mutations) {
		if (type == "attributes") {
			const next = target.getAttribute(name)
			const camelName = kebabToCamel(name)
			if (String(target.state.values[camelName]) !== next)
				target.state.values[camelName] = next
		}
	}
})

export const component = (name, generator, methods) => {
	if (typeof name === "function") {
		methods = generator
		generator = name
		name = camelToKebab(generator.name)
	}
	const Element = class extends HTMLElement{
		constructor() {
			super()
			this.state = new State(Object.fromEntries([...this.attributes].map(attribute => [kebabToCamel(attribute.name), attribute.value])))
			this.state.addEventListener("change", event => {
				for (const {property, to: value} of event.changes) {
					const kebabName = camelToKebab(property)
					if (this.getAttribute(kebabName) !== String(value))
						this.setAttribute(kebabName, value)
				}
			})
			attributeObserver.observe(this, {attributes: true})
			this.replaceChildren(generator.call(this, this.state))
		}
	}
	if (methods) {
		Object.defineProperties(Element.prototype, Object.getOwnPropertyDescriptors(methods))
	}
	customElements.define(name, Element)
	return Element;
}

class ComposedState extends SimpleState {
	#func
	#states

	constructor(func, options, ...states) {
		super(options)

		this.#func = func
		this.#states = states

		const abortController = new AbortController()
		abortRegistry.register(this, abortController)
		const ref = new WeakRef(this)

		states.forEach(state => {
			state.addEventListener("change", event => {
				const value = event.final.get("value")
				if (value) ref.deref()?.scheduleUpdate()
			}, {signal: abortController.signal})
		})

		this.update()
	}

	#microtaskQueued
	scheduleUpdate() {
		if (this.synchronous) {
			this.update()
		} else {
			if (!this.#microtaskQueued) {
				queueMicrotask(() => {
					this.#microtaskQueued = false
					this.update()
				})
			}
			this.#microtaskQueued = true
		}
	}

	update() {
		const value = this.#func(...this.#states.map(state => state.value))
		const change = {property: "value", from: this.value, to: value}
		this.value = value
		this.dispatchEvent(new ChangeEvent([change]))
	}
}

export const compose = func => (...states) => new ComposedState(func, {synchronous: false}, ...states)

const eventName = "mutation"

class MutationEvent extends Event {
	constructor() {
		super(eventName, {bubbles: true})
	}
}

const mutationObserver = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		mutation.target.dispatchEvent(new MutationEvent())
	}
})

export class DOMState extends SimpleState {
	#target
	#getValue
	#equal

	#old
	#changedValue = false

	constructor(target, options) {
		super(options)
		this.#target = target
		this.#getValue = options.get ?? (target => target.value)
		this.#equal = options.equal ?? ((a, b) => a===b)

		this.#old = this.#getValue(target)

		const controller = new AbortController()
		target.addEventListener(eventName, event=>{this.update(event)}, {signal: controller.signal})

		abortRegistry.register(this, controller)
		mutationObserver.observe(target, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		})
	}

	get value() { return this.#old }

	update() {
		const current = this.#getValue(this.#target)

		if (this.#equal(this.#old, current)) return

		this.#old = current

		if (this.synchronous) {
			this.dispatchEvent(new ChangeEvent(["value", current]))
		} else {
			if (!this.#changedValue) {
				queueMicrotask(() => {
					this.#changedValue = false
					this.dispatchEvent(new ChangeEvent(["value", this.#changedValue]))
				})
				this.#changedValue = current
			}
		}
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

export default State
