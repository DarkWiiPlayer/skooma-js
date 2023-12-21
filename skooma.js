/*
A functional HTML generation library.

Example:
	html.label(
		html.span("Delete everything", {class: ["warning", "important"]}),
		html.button("Click", {onClick: e => document.body.innerHTML=""}),
	)
or
	html.ul([1, 2, 3, 4, 5].map(x => html.li(x)), {class: "numbers"})
*/

export const empty = Symbol("Explicit empty argument for Skooma")

const keyToPropName = key => key.replace(/^[A-Z]/, a => "-"+a).replace(/[A-Z]/g, a => '-'+a.toLowerCase())

const insertStyles = (rule, styles) => {
	for (const [key, value] of Object.entries(styles))
		if (typeof value == "undefined")
			rule.removeProperty(keyToPropName(key))
	else
		rule.setProperty(keyToPropName(key), value.toString())
}

const parseAttribute = (attribute) => {
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

const isReactive = object => object
	&& (typeof object == "object")
	&& ("addEventListener" in object)
	&& ("value" in object)

const toChild = arg => {
	if (typeof arg == "string" || typeof arg == "number") {
		return document.createTextNode(arg)
	} else if ("nodeName" in arg) {
		return arg
	} else if (isReactive(arg)) {
		return reactiveChild(arg)
	}
}

const reactiveChild = reactive => {
	const ref = new WeakRef(toChild(reactive.value))
	reactive.addEventListener("change", () => {
		const value = ref.deref()
		if (value)
			value.replaceWith(reactiveChild(reactive))
	}, {once: true})
	return ref.deref()
}

const specialAttributes = {
	value: {
		get: element => element.value,
		set: (element, value) => {
			element.setAttribute("value", value)
			element.value = value
		},
		hook: (element, callback) => { element.addEventListener("input", callback) }
	},
	style: {
		set: (element, value) => { insertStyles(element.style, value) }
	},
	dataset: {
		set: (element, value) => {
			for (const [attribute2, value2] of Object.entries(value)) {
				element.dataset[attribute2] = parseAttribute(value2)
			}
		}
	},
	shadowRoot: {
		set: (element, value) => {
			parseArgs((element.shadowRoot || element.attachShadow({mode: "open"})), null, value)
		}
	}
}

const setAttribute = (element, attribute, value, cleanupSignal) => {
	const special = specialAttributes[attribute]
	if (isReactive(value))
		setReactiveAttribute(element, attribute, value)
	else if (typeof value === "function")
		element.addEventListener(attribute.replace(/^on[A-Z]/, x => x.charAt(x.length-1).toLowerCase()), value, {signal: cleanupSignal})
	else if (special) {
		special.set(element, value)
	}
	else if (value === true)
		{if (!element.hasAttribute(attribute)) element.setAttribute(attribute, '')}
	else if (value === false)
		element.removeAttribute(attribute)
	else {
		element.setAttribute(attribute, parseAttribute(value))
	}
}

const setReactiveAttribute = (element, attribute, reactive, abortController) => {
	if (abortController) abortController.abort()
	abortController = new AbortController()

	const ref = new WeakRef(element)
	setAttribute(element, attribute, reactive.value, abortController.signal)

	reactive.addEventListener("change", () => {
		const element = ref.deref()
		if (element)
			setReactiveAttribute(element, attribute, reactive, abortController)
	}, {once: true})

	const special = specialAttributes[attribute]
	if (special?.hook) {
		special.hook(element, () => {
			const value = special.get(element, attribute)
			if (value != reactive.value) reactive.value = value
		})
	}
}

const parseArgs = (element, before, ...args) => {
	if (element.content) element = element.content
	for (const arg of args) if (arg !== empty) {
		const child = toChild(arg)
		if (child)
			element.insertBefore(child, before)
		else if (arg === undefined || arg == null)
			console.warn(`An argument of type ${typeof arg} has been ignored`, element)
		else if (typeof arg == "function")
			arg(element)
		else if ("length" in arg)
			parseArgs(element, before, ...arg)
		else
			for (const key in arg)
				setAttribute(element, key, arg[key])
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
	parseArgs(element, null, args)
	return element
}

const nameSpacedProxy = (options={}) => new Proxy(Window, {
	get: (_target, prop, _receiver) => { return (...args) => node(prop, args, options) },
	has: (_target, _prop) => true,
})

export const html = nameSpacedProxy({nameFilter: name => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()})
export const svg = nameSpacedProxy({xmlns: "http://www.w3.org/2000/svg"})

// Other utility exports

// Wraps an event handler in a function that calls preventDefault on the event
export const handle = fn => event => { fn(event); event.preventDefault() }

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
