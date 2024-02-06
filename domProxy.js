export const domArray = (methods, extra) => {
	if (extra) return domArray(extra)(methods)

	const traps = {
		get(target, prop) {
			if (prop === "length") {
				return target.children.length
			} else if (prop === Symbol.iterator) {
				return function*() {
					for (const child of target.children) {
						yield methods.get.call(child)
					}
				}
			} else if (prop.match?.call(prop, /^[0-9]+$/)) {
				const child = target.children[prop]
				if (child) return methods.get.call(child)
				return child
			} else {
				return Array.prototype[prop]
			}
		},
		set(target, prop, value) {
			if (prop.match?.call(prop, /^[0-9]+$/)) {
				const child = target.children[prop]
				if (child) {
					methods.set.call(child, value)
					return true
				} else {
					for (let i = target.children.length; i < Number(prop); i++) {
						target.appendChild(methods.new(undefined))
					}
					const element = methods.new(value)
					target.appendChild(element)
					if (methods.get.call(element) !== value)
						methods.set.call(element, value)
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
		if (!(element instanceof Element)) throw(new Error("Creating domArray on non-element"))
		return new Proxy(element, traps)
	}
}
