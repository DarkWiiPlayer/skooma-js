class ChildObserver extends MutationObserver {
	constructor() {
		super(mutations => {
			for (const mutation of mutations) {
				mutation.target.dispatchEvent(new CustomEvent("change", {detail: mutation}))
			}
		})
	}

	observe(element) {
		MutationObserver.prototype.observe.call(this, element, { childList: true })
	}
}

export const lense = (methods, extra) => {
	if (extra) return lense(extra)(methods)

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
		if (!(element instanceof Element)) throw(new Error("Creating domLense on non-element"))
		return new Proxy(element, traps)
	}
}

export default lense
