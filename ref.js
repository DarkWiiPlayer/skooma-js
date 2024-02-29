/** A reference to a reactive element that follows it around through changes */
export class Ref {
	#current
	/** @param {Element|Text} target A reactive element to follow */
	constructor(target) {
		this.#current = target
		this.follow(target)
	}

	follow(target) {
		target.addEventListener("replaced", ({next}) => {
			this.#current = next
			this.follow(next)
		})
	}

	deref() { return this.#current }
}
