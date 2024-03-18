// Keep a referee alive until a referrer is collected
const weakReferences = new WeakMap()
const untilDeathDoThemPart = (referrer, reference) => {
	if (!weakReferences.has(referrer)) weakReferences.set(referrer, new Set())
	weakReferences.get(referrer).add(reference)
}

// Like AbortController, but resets after each abort
class MultiAbortController {
	#controller = new AbortController()
	get signal() { return this.#controller.signal }
	abort() { this.#controller.abort(); this.#controller = new AbortController() }
}

/** A symbol representing nothing to be appended to an element */
export const empty = Symbol("Explicit empty argument for Skooma")

/** Converts a snake-case string to a CSS property name
* @param {string} key
* @return {string}
*/
const snakeToCSS = key => key.replace(/^[A-Z]/, a => "-"+a).replace(/[A-Z]/g, a => '-'+a.toLowerCase())

/**
* @param {CSSStyleDeclaration} style The style property of a node
* @param {object} rules A map of snake case property names to css values
*/
const insertStyles = (style, rules) => {
	for (const [key, value] of Object.entries(rules))
		if (typeof value == "undefined")
			style.removeProperty(snakeToCSS(key))
	else
		style.setProperty(snakeToCSS(key), value.toString())
}

/** @typedef SpecialAttributeDescriptor
* @type {object}
* @property {function(this:any):void} [get]
* @property {function(this:any,any):void} [set]
* @property {function(this:any,function():void):void} [hook]
*/

/**
* @type {Object<string,SpecialAttributeDescriptor>}
*/
const specialAttributes = {
	value: {
		get() { return this.value },
		set(value) {
			this.setAttribute("value", value)
			this.value = value
		},
		hook(callback) { this.addEventListener("input", callback) }
	},
	style: {
		set(value) { insertStyles(this.style, value) }
	},
	dataset: {
		set(value) {
			for (const [attribute2, value2] of Object.entries(value)) {
				this.dataset[attribute2] = processAttribute(value2)
			}
		}
	},
	shadowRoot: {
		set(value) {
			processArgs((this.shadowRoot || this.attachShadow({mode: "open"})), value)
		}
	}
}

const processAttribute = attribute => {
	if (typeof attribute == "string" || typeof attribute == "number")
		return attribute
	else if (attribute && "join" in attribute)
		return attribute.join(" ")
	else
		return JSON.stringify(attribute)
}

/** Returns a fallback if value is defined */
const defined = (value, fallback) => typeof value != "undefined" ? value : fallback

/** Recursively finds the last 'is' attribute in a list nested array of objects
* @param {Array} args
*/
const getCustom = args => args.reduce(
	(current, argument) => Array.isArray(argument)
		? defined(getCustom(argument), current)
		: (argument && typeof argument == "object")
		? defined(argument.is, current)
		: current
	,undefined
)

/**
* @typedef Observable
* @type {EventTarget|object}
* @property {any} value
*/

/** Returns whether an object is an observable according to skooma's contract
* @param {any} object
* @return {object is Observable}
*/
export const isObservable = object => object && object.observable

/** Turns an argument into something that can be inserted as a child into a DOM node
* @param {any} value
* @return {Element|Text}
*/
const toElement = value => {
	if (typeof value == "string" || typeof value == "number")
		return document.createTextNode(value.toString())
	else if (value instanceof Element)
		return value
	else if (isObservable(value))
		return reactiveElement(value)
}

class ReplaceEvent extends Event {
	/** @param {Element|Text} next */
	constructor(next) {
		super("replace", {bubbles: true, cancelable: true})
		this.next = next
	}
}

class ReplacedEvent extends Event {
	/** @param {Element|Text} next */
	constructor(next) {
		super("replaced")
		this.next = next
	}
}

/** @type {WeakMap<Text|Element,Text|Element>} */
export const newer = new WeakMap()

/**
* @param {Observable} observable
* @return {Element|Text}
*/
export const reactiveElement = observable => {
	const element = toElement(observable.value)
	untilDeathDoThemPart(element, observable)
	const ref = new WeakRef(element)
	observable.addEventListener("change", () => {
		const next = reactiveElement(observable)
		const element = ref.deref()
		if (element.dispatchEvent(new ReplaceEvent(next)))
			element.replaceWith(next)
		newer.set(this, next)
		element.dispatchEvent(new ReplacedEvent(next))
	}, {once: true})
	return element
}

/** Set an attribute on an element
* @param {Element} element
* @param {string} attribute
* @param {any} value
* @param {AbortSignal} [cleanupSignal]
*/
const setAttribute = (element, attribute, value, cleanupSignal) => {
	const special = specialAttributes[attribute]
	if (isObservable(value))
		setReactiveAttribute(element, attribute, value)
	else if (typeof value === "function")
		element.addEventListener(attribute, value, {signal: cleanupSignal})
	else if (special?.set)
		special.set.call(element, value)
	else if (value === true)
		{if (!element.hasAttribute(attribute)) element.setAttribute(attribute, '')}
	else if (value === false)
		element.removeAttribute(attribute)
	else {
		element.setAttribute(attribute, processAttribute(value))
	}
}

/** Set up a binding between an attribute and an observable
* @param {Element} element
* @param {string} attribute
* @param {Observable} observable
*/
const setReactiveAttribute = (element, attribute, observable) => {
	const multiAbort = new MultiAbortController()

	observable.addEventListener("change", () => {
		multiAbort.abort()
		setAttribute(element, attribute, observable.value, multiAbort.signal)
	})
	setAttribute(element, attribute, observable.value, multiAbort.signal)

	const special = specialAttributes[attribute]
	if (special.hook) {
		untilDeathDoThemPart(element, observable)
		special.hook.call(element, () => {
			const current = special.get.call(element, attribute)
			if (current != observable.value) observable.value = current
		})
	}
}

/** Processes a list of arguments for an HTML Node
* @param {Element} element
* @param {Array} args
*/
const processArgs = (element, ...args) => {
	for (const arg of args) if (arg !== empty) {
		if (Array.isArray(arg)) {
			processArgs(element, ...arg)
		} else {
			const child = toElement(arg)
			if (child)
				element.append(child)
			else if (arg === undefined || arg == null)
				console.warn(`An argument of type ${typeof arg} has been ignored`, element)
			else if (typeof arg == "function" && arg.length == 0)
				processArgs(element, arg())
			else if (typeof arg == "function")
				arg(element)
			else
				for (const key in arg)
					setAttribute(element, key, arg[key])
		}
	}
}

/** Creates a new node
* @param {String} name
* @param {Array} args
* @param {Object} options
*/
const node = (name, args, options) => {
	let element
	const custom = getCustom(args)
	const opts = custom && {is: String(custom)}

	if ("nameFilter" in options) name = options.nameFilter(name)
	if (options.xmlns)
		element = document.createElementNS(options.xmlns, name, opts)
	else
		element = document.createElement(name, opts)
	processArgs(element, args)
	return element
}

const nameSpacedProxy = (options={}) => new Proxy(Window, {
	/** @param {string} prop */
	get: (_target, prop, _receiver) => { return (...args) => node(prop, args, options) },
	has: (_target, _prop) => true,
})

export const html = nameSpacedProxy({nameFilter: name => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()})
export const svg = nameSpacedProxy({xmlns: "http://www.w3.org/2000/svg"})
export default html

// Other utility exports

/** Wraps an event handler in a function that calls preventDefault on the event
* @param {function(event) : event} fn
* @return {function(event)}
*/
export const handle = fn => event => { event.preventDefault(); return fn(event) }

/** Wraps a list of elements in a document fragment
* @param {Array<Element|String>} elements
*/
export const fragment = (...elements) => {
	const fragment = new DocumentFragment()
	for (const element of elements)
		fragment.append(toElement(element))
	return fragment
}

/** Turns a template literal into document fragment.
* Strings are returned as text nodes.
* Elements are inserted in between.
* @param {Array<String>} literals
* @param {Array<any>} items
* @return {DocumentFragment}
*/
const textFromTemplate = (literals, items) => {
	const fragment = new DocumentFragment()
	for (const key in items) {
		fragment.append(document.createTextNode(literals[key]))
		fragment.append(toElement(items[key]))
	}
	fragment.append(document.createTextNode(literals[literals.length-1]))
	return fragment
}

/**
* @param {String|Array<String>} data
* @param {Array<String|Element>} items
*/
export const text = (data="", ...items) =>
	Array.isArray(data)
		? textFromTemplate(data, items)
		: document.createTextNode(data)
