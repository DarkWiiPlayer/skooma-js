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

const parseArgs = (element, before, ...args) => {
	if (element.content) element = element.content
	for (const arg of args) if (arg !== empty)
		if (typeof arg == "string" || typeof arg == "number")
			element.insertBefore(document.createTextNode(arg), before)
		else if (arg === undefined || arg == null)
			console.warn(`An argument of type ${typeof arg} has been ignored`, element)
		else if (typeof arg == "function")
			arg(element)
		else if ("nodeName" in arg)
			element.insertBefore(arg, before)
		else if ("length" in arg)
			parseArgs(element, before, ...arg)
		else
			for (const key in arg)
				if (key == "style" && typeof(arg[key])=="object")
					insertStyles(element.style, arg[key])
				else if (key == "dataset" && typeof(arg[key])=="object")
					for (const [key2, value] of Object.entries(arg[key]))
						element.dataset[key2] = parseAttribute(value)
				else if (key == "shadowRoot")
					parseArgs((element.shadowRoot || element.attachShadow({mode: "open"})), null, arg[key])
				else if (typeof arg[key] === "function")
					element.addEventListener(key.replace(/^on[A-Z]/, x => x.charAt(x.length-1).toLowerCase()), arg[key])
				else if (arg[key] === true)
					{if (!element.hasAttribute(key)) element.setAttribute(key, '')}
				else if (arg[key] === false)
					element.removeAttribute(key)
				else
					element.setAttribute(key, parseAttribute(arg[key]))
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

export const bind = transform => {
	let element
	const inject = next => Object.defineProperty(next, 'current', {get: () => element})
	const update = (...data) => {
		const next = transform(...data)
		if (next) {
			if (typeof next == "string") {
				element.innerText = next
				return element
			} else {
				if (element) element.replaceWith(next)
				element = inject(next)
				return element
			}
		}
	}
	return update
}

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
