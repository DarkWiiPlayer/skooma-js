/** @type FinalizationRegistry<AbortController> */
const abortRegistry = new FinalizationRegistry(controller => controller.abort())

/** @param {String} string */
const camelToKebab = string => string.replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`)
/** @param {String} string */
const kebabToCamel = string => string.replace(/([a-z])-([a-z])/g, (_, a, b) => a+b.toUpperCase())

const identity = object=>object

const target = Symbol("Proxy Target")

/* Custom Event Classes */

export class SynchronousChangeEvent extends Event {
	constructor(change) {
		super('synchronous', {cancelable: true})
		this.change = change
	}
}

export class MultiChangeEvent extends Event {
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

export class ValueChangeEvent extends MultiChangeEvent {
	get value() {
		return this.final.value
	}
}

/* Observable Classes */

export class Observable extends EventTarget {
	#synchronous
	/** @type Array<{name:string, from, to}> */
	#queue
	#abortController = new AbortController

	#ref = new WeakRef(this)
	get ref() { return this.#ref }

	observable = true

	constructor({synchronous}={}) {
		super()
		if (this.constructor === Observable) {
			throw new TypeError("Cannot instantiate abstract class")
		}
		this.#synchronous = !!synchronous
		abortRegistry.register(this, this.#abortController)

		this.proxy = new Proxy(this.constructor.prototype.proxy, {
			get: (target, prop) => target.call(this, prop)
		})
	}

	proxy(prop, {get, set, ...options}={}) {
		const proxy = new ProxiedObservableValue(this, prop, options)
		if (get) proxy.get = get
		if (set) proxy.set = set
		return proxy
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

	enqueue(property, from, to, mutation=false) {
		const change = {property, from, to, mutation}
		if (!this.dispatchEvent(new SynchronousChangeEvent(change))) return false
		if (!this.synchronous) {
			if (!this.#queue) {
				this.#queue = []
				queueMicrotask(() => {
					this.emit(...this.#queue)
					this.#queue = undefined
				})
			}
			this.#queue.push(change)
		} else {
			this.emit(change)
		}
		return true
	}

	emit() {
		throw new TypeError(`${this.constructor.name} did not define an 'emit' method`)
	}

	get signal() { return this.#abortController.signal }
	get synchronous() { return this.#synchronous }
}

export class ObservableObject extends Observable {
	#shallow

	constructor(target={}, {shallow, ...options}={}) {
		super(options)
		this.#shallow = !!shallow
		this[target] = target
		this.values = new Proxy(target, {
			set: (target, prop, value) => {
				const old = target[prop]
				if (old === value) {
					return true
				} else {
					if (this.enqueue(prop, old, value)) {
						if (!this.#shallow) {
							if (old instanceof Observable) this.disown(prop, old)
							if (value instanceof Observable) this.adopt(prop, value)
						}
						target[prop] = value
						return true
					} else {
						return false
					}
				}
			},
			get: (target, prop) => target[prop],
		})
	}

	proxy(prop, {get, set, ...options}={}) {
		const proxy = new ProxiedObservableValue(this, prop, {values: this.values, ...options})
		if (get) proxy.get = get
		if (set) proxy.set = set
		return proxy
	}

	emit(...changes) {
		this.dispatchEvent(new MultiChangeEvent(...changes))
	}

	/** @type Map<Observable, Map<String, Function>> */
	#nested = new Map()

	adopt(prop, observable) {
		let handlers = this.#nested.get(observable)
		if (!handlers) {
			// Actual adoption
			handlers = new Map()
			this.#nested.set(observable, handlers)
		}
		const ref = this.ref
		const handler = () => ref.deref()?.emit(prop, observable, observable, {observable: true})

		handlers.set(prop, handler)
		observable.addEventListener("change", handler, {signal: this.signal})
	}

	disown(prop, observable) {
		const handlers = this.#nested.get(observable)
		const handler = handlers.get(prop)
		observable.removeEventListener("change", handler)
		handlers.delete(prop)
		if (handlers.size == 0) {
			this.#nested.delete(observable)
		}
	}
}

export class ObservableValue extends Observable {
	#value

	constructor(value, options) {
		super(options)
		this.#value = value
	}

	get value() { return this.#value }
	set value(value) {
		if (this.enqueue("value", this.#value, value)) {
			this.#value = value
		}
	}

	emit(...changes) {
		this.dispatchEvent(new ValueChangeEvent(...changes))
	}
}

class ProxiedObservableValue extends ObservableValue {
	#backend
	#values
	#prop

	constructor(backend, prop, {values=backend, ...options}={}) {
		super(options)
		this.#backend = backend
		this.#values = values
		this.#prop = prop

		const ref = this.ref
		backend.addEventListener("synchronous", event => {
			const {property, from, to, ...rest} = event.change
			if (property == this.#prop) {
				ref.deref()?.enqueue({
					property,
					from: this.get(from),
					to: this.get(to),
					...rest
				})
			}
		}, { signal: this.signal })
	}

	get = identity
	set = identity

	get value() { return this.get(this.#values[this.#prop]) }
	set value(value) { this.#values[this.#prop] = this.set(value) }
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
			const target = Object.fromEntries([...this.attributes].map(attribute => [kebabToCamel(attribute.name), attribute.value]))
			this.state = new ObservableObject(target)
			this.state.addEventListener("change", event => {
				for (const {property, to: value} of event.changes) {
					const kebabName = camelToKebab(property)
					if (this.getAttribute(kebabName) !== String(value))
						this.setAttribute(kebabName, value)
				}
			})
			attributeObserver.observe(this, {attributes: true})
			const content = generator.call(this, this.state)
			if (content) this.replaceChildren(content)
		}
	}
	if (methods) {
		Object.defineProperties(Element.prototype, Object.getOwnPropertyDescriptors(methods))
	}
	customElements.define(name, Element)
	return Element;
}

class ObservableComposition extends ObservableValue {
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
			state.addEventListener("change", () => {
				ref.deref()?.scheduleUpdate()
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
				this.#microtaskQueued = true
			}
		}
	}

	update() {
		const value = this.#func(...this.#states.map(state => state.value))
		const change = {property: "value", from: this.value, to: value}
		this.value = value
		this.emit(change)
	}
}

export const compose = func => (...states) => new ObservableComposition(func, {}, ...states)

class MutationEvent extends Event {
	constructor() {
		super("mutation", {bubbles: true})
	}
}

const mutationObserver = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		mutation.target.dispatchEvent(new MutationEvent())
	}
})

export class ObservableElement extends Observable {
	#getValue
	#equal

	#value
	#changedValue = false

	constructor(target, {get, equal, ...options}={}) {
		super(options)
		this[target] = target

		this.#getValue = get ?? (target => target.value)
		this.#equal = equal ?? ((a, b) => a===b)

		this.#value = this.#getValue(target)

		const controller = new AbortController()
		target.addEventListener("mutation", event => { this.update(event) }, {signal: controller.signal})

		abortRegistry.register(this, controller)
		mutationObserver.observe(target, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		})
	}

	get value() { return this.#value }

	update() {
		const current = this.#getValue(this[target])

		if (this.#equal(this.#value, current)) return

		this.#value = current

		if (this.synchronous) {
			this.dispatchEvent(new MultiChangeEvent(["value", current]))
		} else {
			if (!this.#changedValue) {
				queueMicrotask(() => {
					this.#changedValue = false
					this.dispatchEvent(new MultiChangeEvent(["value", this.#changedValue]))
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
