// Keep a referee alive until a referrer is collected
const weakReferences = new WeakMap()

/** Keeps the referenced value alive until the referrer is collected
 * @param {Object} referrer
 * @param {Object} reference
 */
const untilDeathDoThemPart = (referrer, reference) => {
	if (!weakReferences.has(referrer)) weakReferences.set(referrer, new Set())
	weakReferences.get(referrer).add(reference)
}

/** Like AbortController, but resets after each abort */
class MultiAbortController {
	#controller = new AbortController()
	/** @return {AbortSignal} */
	get signal() { return this.#controller.signal }
	abort() { this.#controller.abort(); this.#controller = new AbortController() }
}

/** A symbol representing nothing to be appended to an element */
export const empty = Symbol("Explicit empty argument for Skooma")

/** Converts a snake-case string to a CSS property name
 * @param {string} key
 * @return {string}
 */
const snakeToCSS = key => key.replace(/^[A-Z]/, a => "-" + a).replace(/[A-Z]/g, a => '-' + a.toLowerCase())

/** @typedef SpecialAttributeDescriptor
 * @type {object}
 * @property {function(Node):void} [get]
 * @property {function(Node,any):void} [set]
 * @property {function(Node,function(any):void):void} [subscribe]
 * @property {function(Node):boolean} [filter]
 */

/**
 * Returns a fallback if value is fallback
 * @param {any} value
 * @param {any} whenUndefined
 */
const fallback = (value, whenUndefined) => typeof value != "undefined" ? value : whenUndefined

/** @typedef {EventTarget & {value: any}} Observable */

/** Cancelable event triggered when a reactive element gets replaced with something else */
export class BeforeReplaceEvent extends Event {
	/** @param {Element|Text} next */
	constructor(next) {
		super("skooma:beforereplace", { cancelable: true })
		this.next = next
	}
}

/** Event triggered when a reactive element was replaced */
export class AfterReplaceEvent extends Event {
	/** @param {Element|Text} next */
	constructor(next) {
		super("skooma:afterreplace")
		this.next = next
	}
}

/** Event triggered when a new element replaces an old one */
export class ReplacedEvent extends Event {
	/** @param {Element|Text} old */
	constructor(old) {
		super("skooma:replaced", { bubbles: true })
		this.old = old
	}
}

// Other utility exports

/** Wraps an event handler in a function that calls preventDefault on the event
 * @param {function(event) : event} fn
 * @return {function(event)}
 */
export const handle = fn => event => { event.preventDefault(); return fn(event) }


/** A reference to an element that follows it around through replacements */
export class Ref {
	/** @type {WeakMap<Text|Element,Text|Element>} */
	static #map = new WeakMap()

	/** @type {Element|Text} */
	#element

	/** @param {Element|Text} element */
	constructor(element) {
		this.#element = element
	}

	/** @return {Element|Text} */
	deref() {
		const next = Ref.newer(this.#element)
		if (next) {
			this.#element = next
			return this.deref()
		} else {
			return this.#element
		}
	}

	/** @param {Element|Text} element */
	static newer(element) {
		return this.#map.get(element)
	}

	/**
	 * @param {Element|Text} previous
	 * @param {Element|Text} next
	 */
	static replace(previous, next) {
		if (this.newer(previous))
			throw "Element has already been replaced with newer one"
		this.#map.set(previous, next)
	}
}

/** Main class doing all the rendering */
export class Renderer {
	static proxy() {
		return new Proxy(new this(), {
			/** @param {string} prop */
			get: (renderer, prop) => /** @param {any[]} args */ (...args) => renderer.node(prop, args),
			has: (renderer, prop) => renderer.nodeSupported(prop),
		})
	}

	/** @param {string} name */
	node(name, ...args) {
		throw "Attempting to use an abstract Renderer"
	}

	/** @param {string|symbol} name */
	nodeSupported(name) {
		if (typeof(name) != "string") return false
		return true
	}

	/** Turns an attribute value into a string */
	/** @param {any} value */
	static serialiseAttributeValue(value) {
		if (typeof value == "string" || typeof value == "number")
			return value
		else if (value && "join" in value)
			return value.join(" ")
		else if (Object.getPrototypeOf(value) == Object.prototype)
			return JSON.stringify(value)
		else
			return value.toString()
	}
}

export class DomRenderer extends Renderer {
	/** @type {Object<string,SpecialAttributeDescriptor>} */
	static specialAttributes = Object.freeze({})

	/** Processes a list of arguments for an HTML Node
	 * @param {Element|ShadowRoot} element
	 * @param {Array} args
	 */
	static apply(element, ...args) {
		for (const arg of args) if (arg !== empty) {
			if (Array.isArray(arg)) {
				this.apply(element, ...arg)
			} else {
				const child = this.toElement(arg)
				if (child)
					element.append(child)
				else if (typeof arg == "function")
					this.apply(element, arg(element) || empty)
				else if (arg instanceof DocumentFragment)
					element.append(arg)
				else if (arg && typeof(arg)=="object")
					for (const key in arg)
						if (element instanceof Element)
							this.setAttribute(element, key, arg[key])
						else
							throw `Attempting to set attributes on a non-element (${element.constructor.name})`
				else
					console.warn(`An argument of type ${typeof arg} has been ignored`, element)
			}
		}
	}

	/** Creates a new node
	 * @param {String} name
	 * @param {Array} args
	 */
	node(name, args) {
		const element = this.createElement(name)
		this.constructor.apply(element, args)
		return element
	}

	/**
	 * @protected
	 * @param {String} name
	 * @param {Object} options
	 * @return {Node}
	 */
	createElement(name, options={}) {
		return document.createElement(name, options)
	}

	/** Turns an argument into something that can be inserted as a child into a DOM node
	 * @protected
	 * @param {any} value
	 * @return {Element|Text}
	 */
	static toElement(value) {
		if (typeof value == "string" || typeof value == "number")
			return document.createTextNode(value.toString())
		else if (value instanceof Element)
			return value
		else if (this.isObservable(value))
			return this.toReactiveElement(value)
	}

	/**
	 * @protected
	 * @param {Observable} observable
	 * @return {Element|Text}
	 */
	static toReactiveElement(observable) {
		if (observable.value instanceof DocumentFragment) {
			throw "Failed to create reactive element: Document fragments cannot be replaced dynamically"
		}
		const element = this.toElement(observable.value)
		untilDeathDoThemPart(element, observable)
		let ref = new WeakRef(element)

		const handleChange = () => {
			const element = ref.deref()

			if (!element) return

			const next = this.toElement(observable.value)
			if (element?.dispatchEvent(new BeforeReplaceEvent(next))) {
				element.replaceWith(next)
				Ref.replace(element, next)
				next.dispatchEvent(new ReplacedEvent(element))
				element.dispatchEvent(new AfterReplaceEvent(next))
				ref = new WeakRef(next)
			}
			observable.addEventListener("change", handleChange, {once: true})
		}
		observable.addEventListener("change", handleChange, {once: true})

		return element
	}

	/** Set an attribute on an element
	 * @protected
	 * @param {Element} element
	 * @param {string} attribute
	 * @param {any} value
	 * @param {AbortSignal} [cleanupSignal]
	 */
	static setAttribute(element, attribute, value, cleanupSignal) {
		const special = this.getSpecialAttribute(element, attribute)

		if (this.isObservable(value))
			this.setReactiveAttribute(element, attribute, value)
		else if (typeof value === "function")
			element.addEventListener(attribute, value, { signal: cleanupSignal })
		else if (special?.set)
			special.set(element, value)
		else if (value === true)
			{ if (!element.hasAttribute(attribute)) element.setAttribute(attribute, '') }
		else if (value === false)
			element.removeAttribute(attribute)
		else {
			element.setAttribute(attribute, this.serialiseAttributeValue(value))
		}
	}

	/** Set up a binding between an attribute and an observable
	 * @protected
	 * @param {Element} element
	 * @param {string} attribute
	 * @param {Observable} observable
	 */
	static setReactiveAttribute(element, attribute, observable) {
		const multiAbort = new MultiAbortController()

		observable.addEventListener("change", () => {
			multiAbort.abort()
			this.setAttribute(element, attribute, observable.value, multiAbort.signal)
		})
		this.setAttribute(element, attribute, observable.value, multiAbort.signal)

		const special = this.getSpecialAttribute(element, attribute)

		if (special?.subscribe) {
			untilDeathDoThemPart(element, observable)
			special.subscribe(element, value => {
				if (value != observable.value) observable.value = value
			})
		}
	}

	/**
	 * @param {CSSStyleDeclaration} style The style property of a node
	 * @param {object} rules A map of snake case property names to css values
	 */
	static insertStyles(style, rules) {
		for (const [key, value] of Object.entries(rules))
			if (typeof value == "undefined")
				style.removeProperty(snakeToCSS(key))
			else
				style.setProperty(snakeToCSS(key), value.toString())
	}

	/** Returns whether an object is an observable according to skooma's contract
	 * @param {any} object
	 * @return {object is Observable}
	 */
	static isObservable(object) {
		return object && object.observable
	}

	/** Wraps a list of elements in a document fragment
	 * @param {Array<Element|String>} elements
	 */
	static documentFragment(...elements) {
		const fragment = new DocumentFragment()
		for (const element of elements)
			fragment.append(this.toElement(element))
		return fragment
	}

	/**
	 * @protected
	 * @param {Element} element
	 * @param {String} attribute
	 */
	static getSpecialAttribute(element, attribute) {
		const special = this.specialAttributes[attribute]
		if (special?.filter == undefined)
			return special
		if (special.filter(element))
			return special
		return undefined
	}

	/**
	 * @param {String|Array<String>} data
	 * @param {Array<String|Element>} items
	 */
	static createTextOrFragment(data = "", ...items) {
		return Array.isArray(data)
			? this.textFromTemplate(data, items)
			: document.createTextNode(data)
	}

	/** Turns a template literal into document fragment.
	 * Strings are returned as text nodes.
	 * Elements are inserted in between.
	 * @param {Array<String>} literals
	 * @param {Array<any>} items
	 * @return {DocumentFragment}
	 */
	static textFromTemplate(literals, items) {
		const fragment = new DocumentFragment()
		for (const key in items) {
			fragment.append(document.createTextNode(literals[key]))
			fragment.append(this.toElement(items[key]))
		}
		fragment.append(document.createTextNode(literals[literals.length - 1]))
		return fragment
	}
}

/** Renderer for normal HTML nodes targetting a browser's DOM */
export class DomHtmlRenderer extends DomRenderer {
	/**
	 * @param {String} name
	 * @param {Object} options
	 * @return {Node}
	 */
	createElement(name, options) {
		return document.createElement(name.replace(/([a-z])([A-Z])/g, "$1-$2"), options)
	}

	/** Creates a new node and make it a custom element if necessary
	 * @param {String} name
	 * @param {Array} args
	 */
	node(name, args) {
		const custom = this.getCustom(args)
		const opts = custom && { is: String(custom) }

		const element = this.createElement(name, opts)
		this.constructor.apply(element, args)
		return element
	}

	/** Recursively finds the last 'is' attribute in a list nested array of objects
	 * @param {Array} args
	 */
	getCustom(args) {
		return args.reduce(
			(current, argument) => Array.isArray(argument)
				? fallback(this.getCustom(argument), current)
				: (argument && typeof argument == "object")
					? fallback(argument.is, current)
					: current
			, undefined
		)
	}

	/** @type {Object<string,SpecialAttributeDescriptor>} */
	static specialAttributes = {
		value: {
			/** @param {HTMLInputElement} element */
			get(element) { return element.value },
			/** @param {HTMLInputElement} element */
			set(element, value) {
				element.setAttribute("value", value)
				element.value = value
			},
			/** @param {HTMLInputElement} element */
			subscribe(element, callback) {
				element.addEventListener("input", () => {
					callback(this.get(element))
				})
			},
			/** @param {HTMLElement} element */
			filter(element) {
				return element.nodeName.toLowerCase() == "input"
			}
		},
		style: {
			/** @param {HTMLElement} element */
			set(element, value) { DomRenderer.insertStyles(element.style, value) }
		},
		dataset: {
			/** @param {HTMLElement} element */
			set(element, value) {
				for (const [attribute2, value2] of Object.entries(value)) {
					element.dataset[attribute2] = DomRenderer.serialiseAttributeValue(value2)
				}
			}
		},
		shadowRoot: {
			/** @param {HTMLElement} element */
			set(element, value) {
				DomRenderer.apply(
					(element.shadowRoot || element.attachShadow({ mode: "open" })),
					value
				)
			}
		}
	}
}

/** Renderer for normal SVG nodes targetting a browser's DOM */
export class DomSvgRenderer extends DomRenderer {
	/**
	 * @param {String} name
	 * @param {Object} options
	 * @return {Node}
	 */
	createElement(name, options) {
		return document.createElementNS("http://www.w3.org/2000/svg", name, options)
	}
}

export const html = DomHtmlRenderer.proxy()
export const svg = DomSvgRenderer.proxy()

export const fragment = DomRenderer.documentFragment.bind(DomRenderer)
export const text = DomRenderer.createTextOrFragment.bind(DomRenderer)

export default html
