const parseAttribute = (attribute) => {
	if (typeof attribute == "string" || typeof attribute == "number")
		return attribute
	else if ("join" in attribute)
		return attribute.join(" ")
	else
		return JSON.stringify(attribute)
}

const parseArgs = (element, args) => {
	if (element.content) element = element.content
	for (let arg of args)
		if (typeof arg == "string" || typeof arg == "number")
			element.appendChild(document.createTextNode(arg))
		else if ("nodeName" in arg)
			element.appendChild(arg)
		else if ("length" in arg)
			parseArgs(element, arg)
		else
			for (let key in arg)
				if (typeof arg[key] == "function")
					element.addEventListener(key.replace(/^on[A-Z]/, x => x.charAt(x.length-1).toLowerCase()), arg[key])
				else
					element.setAttribute(key, parseAttribute(arg[key]))
}

const node = (name, args, xmlns) => {
	let element
	if (xmlns)
		element = document.createElementNS(xmlns, name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase())
	else
		element = document.createElement(name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase())
	parseArgs(element, args)
	return element
}

const nameSpacedProxy = (xmlns) => new Proxy(Window, { get: (target, prop, receiver) => { return (...args) => node(prop, args, xmlns) }})

export const html = nameSpacedProxy()
export const svg = nameSpacedProxy("http://www.w3.org/2000/svg")
