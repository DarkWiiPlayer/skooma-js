const parseAttribute = (attribute) => {
	if (typeof(attribute) == "string")
		return attribute
	else if ("join" in attribute)
		return attribute.join(" ")
	else
		return JSON.stringify(attribute)
}

const parseArgs = (element, args) => {
	for (arg of args)
		if (typeof(arg) == "string")
			element.appendChild(document.createTextNode(arg))
		else if ("nodeName" in arg)
			element.appendChild(arg)
		else if ("length" in arg)
			parseArgs(element, arg)
		else
			for (key in arg)
				element.setAttribute(key.replace("_", "-"), parseAttribute(arg[key]))
}

export const node = (name, args) => {
	const element = document.createElement(name.replace("_", "-"))
	parseArgs(element, args)
	return element
}

export const html = new Proxy(Window, { get: (target, prop, receiver) => {
	// This distinction is only helpful because javascript is fucking restarted
	if (prop.search(/^[A-Z]/)+1)
		return (arg) => node(prop, [arg])
	else
		return (...args) => node(prop, args)
}})
