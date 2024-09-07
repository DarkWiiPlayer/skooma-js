export default new Proxy(document, {
	get: (_, tag) => content => {
		let node = document.createElement(tag)
		for (let key in content) node[key] = content[key]
		return node
	}
})
