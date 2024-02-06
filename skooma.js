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

export const empty = Symbol("Explicit empty argument for Skooma")

const snakeToCSS = key => key.replace(/^[A-Z]/, a => "-"+a).replace(/[A-Z]/g, a => '-'+a.toLowerCase())

const insertStyles = (rule, styles) => {
	for (const [key, value] of Object.entries(styles))
		if (typeof value == "undefined")
			rule.removeProperty(snakeToCSS(key))
	else
		rule.setProperty(snakeToCSS(key), value.toString())
}

const processAttribute = (attribute) => {
	if (typeof attribute == "string" || typeof attribute == "number")
		return attribute
	else if (attribute && "join" in attribute)
		return attribute.join(" ")
	else
		return JSON.stringify(attribute)
}

const defined = (value, fallback) => typeof value != "undefined" ? value : fallback
const getCustom = args => args.reduce(
	(current, argument) => Array.isArray(argument)
		? defined(getCustom(argument), current)
		: (argument && typeof argument == "object")
		? defined(argument.is, current)
		: current
	,undefined
)

export const isObservable = object => object
	&& typeof object == "object"
	&& !(object instanceof HTMLElement)
	&& object.subscribe

const toChild = arg => {
	if (typeof arg == "string" || typeof arg == "number")
		return document.createTextNode(arg)
	else if (arg instanceof HTMLElement)
		return arg
	else if (isObservable(arg))
		return reactiveChild(arg)
}

const reactiveChild = observable => {
	let ref
	const abort = observable.subscribe(value => {
		if (ref && !ref.deref()) return abort()
		const child = toChild(value) ?? document.createComment("Placeholder for reactive content")
		untilDeathDoThemPart(child, observable)
		if (ref) ref.deref().replaceWith(child)
		ref = new WeakRef(child)
	})
	return ref.deref()
}

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

// (Two-way) binding between an attribute and a state container
const setReactiveAttribute = (element, attribute, observable) => {
	untilDeathDoThemPart(element, observable)
	const multiAbort = new MultiAbortController()
	let old
	observable.subscribe(value => {
		old = value
		multiAbort.abort()
		setAttribute(element, attribute, value, multiAbort.signal)
	})
	const special = specialAttributes[attribute]
	if (special?.hook && observable.set) {
		special.hook.call(element, () => {
			const value = special.get.call(element, attribute)
			if (value != old) observable.set(value)
		})
	}
}

const processArgs = (element, ...args) => {
	if (element.content) element = element.content
	for (const arg of args) if (arg !== empty) {
		if (arg instanceof Array) {
			processArgs(element, ...arg)
		} else {
			const child = toChild(arg)
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
	get: (_target, prop, _receiver) => { return (...args) => node(prop, args, options) },
	has: (_target, _prop) => true,
})

export const html = nameSpacedProxy({nameFilter: name => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()})
export const svg = nameSpacedProxy({xmlns: "http://www.w3.org/2000/svg"})
export default html

// Other utility exports

// Wraps an event handler in a function that calls preventDefault on the event
export const handle = fn => event => { event.preventDefault(); return fn(event) }

// Wraps a list of elements in a document fragment
export const fragment = (...elements) => {
	const fragment = new DocumentFragment()
	for (const element of elements)
		fragment.append(element)
	return fragment
}

// Turns a template literal into document fragment.
// Strings are returned as text nodes.
// Elements are inserted in between.
const textFromTemplate = (literals, items) => {
	const fragment = new DocumentFragment()
	for (const key in items) {
		fragment.append(document.createTextNode(literals[key]))
		fragment.append(items[key])
	}
	fragment.append(document.createTextNode(literals.at(-1)))
	return fragment
}

export const text = (data="", ...items) =>
	typeof data == "object" && "at" in data
		? textFromTemplate(data, items)
		: document.createTextNode(data)
