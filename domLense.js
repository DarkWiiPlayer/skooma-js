const lense = (methods, extra) => {
	if (extra) return lense(extra)(methods)

	const traps = {
		get(target, prop) {
			if (prop === "length") {
				return target.children.length
			} else if (prop === Symbol.iterator) {
				return function*() {
					for (const child of target.children) {
						yield methods.get(child)
					}
				}
			} else if (prop.match?.call(prop, /^[0-9]+$/)) {
				const child = target.children[prop]
				if (child) return methods.get(child)
				return child
			} else {
				return Array.prototype[prop]
			}
		},
		set(target, prop, value) {
			if (prop.match?.call(prop, /^[0-9]+$/)) {
				const child = target.children[prop]
				if (child) {
					methods.set(child, value)
					return true
				} else if(prop == target.children.length) {
					const element = methods.new(value)
					target.appendChild(element)
					if (methods.get(element) !== value)
						methods.set(element, value)
					return true
				}
			} else if (prop == "length") {
				if (value == target.children.length)
					return true
				else
					return false
			}
		},
		deleteProperty(target, prop) {
			if (prop.match?.call(prop, /^[0-9]+$/)) {
				const child = target.children[prop]
				if (child) child.remove()
				return true
			}
		},
		has(target, prop) {
			return (prop === Symbol.iterator) || (prop in target.children) || (prop in Array.prototype)
		}
	}

	return element => {
		const proxy = new Proxy(element, traps)

		return proxy
	}
}

export default lense
