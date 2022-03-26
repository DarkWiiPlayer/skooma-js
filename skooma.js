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

const keyToPropName = key => key.replace(/^[A-Z]/, a => "-"+a).replace(/[A-Z]/g, a => '-'+a.toLowerCase())

const insertStyles = (rule, styles) => {
	for (let [key, value] of Object.entries(styles))
		if (typeof value == "undefined")
			rule.removeProperty(keyToPropName(key))
	else
		rule.setProperty(keyToPropName(key), value.toString())
}

const parseAttribute = (attribute) => {
	if (typeof attribute == "string" || typeof attribute == "number")
		return attribute
	else if ("join" in attribute)
		return attribute.join(" ")
	else
		return JSON.stringify(attribute)
}

const createPromiseNode = promise => {
	const comment = document.createComment(`Awaiting ${promise}`)
	promise.then(result => {parseArgs(comment.parentNode, comment, result); comment.remove()})
	return comment
}

const parseArgs = (element, before, ...args) => {
	if (element.content) element = element.content
	for (let arg of args)
		if (typeof arg == "string" || typeof arg == "number")
			element.insertBefore(document.createTextNode(arg), before)
		else if (arg === undefined)
			console.warn(`Argument is ${typeof arg}`, element)
		else if (typeof arg == "function")
			arg(element)
		else if ("nodeName" in arg)
			element.insertBefore(arg, before)
		else if (arg.constructor?.name === "Promise")
			element.insertBefore(createPromiseNode(arg), before)
		else if ("length" in arg)
			parseArgs(element, before, ...arg)
		else
			for (let key in arg)
				if (key == "style" && typeof(arg[key])=="object")
					insertStyles(element.style, arg[key])
				else if (key == "dataset" && typeof(arg[key])=="object")
					for (let [key2, value] of Object.entries(arg[key]))
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
	if (options.nameFilter) name = options.nameFilter(name)
	if (options.xmlns)
		element = document.createElementNS(options.xmlns, name)
	else
		element = document.createElement(name)
	parseArgs(element, null, args)
	return element
}

const nameSpacedProxy = (options={}) => new Proxy(Window, {
	get: (target, prop, receiver) => { return (...args) => node(prop, args, options) },
	has: (target, prop) => true,
})

export const bind = transform => {
	let element
	const inject = next => Object.defineProperty(next, 'current', {get: () => element})
	const update = (...data) => {
		const next = transform(...data)
		if (next) {
			if (element) element.replaceWith(next)
			element = inject(next)
			return element
		}
	}
	return update
}

export const handle = fn => event => { event.preventDefault(); return fn(event) }

export const html = nameSpacedProxy({nameFilter: name => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()})
export const svg = nameSpacedProxy({xmlns: "http://www.w3.org/2000/svg"})

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
