import {html,empty} from "https://cdn.jsdelivr.net/gh/darkwiiplayer/skooma-js@f79e7a9/skooma.js"
import {State} from "https://cdn.jsdelivr.net/gh/darkwiiplayer/skooma-js@f79e7a9/state.js"
import element from "https://darkwiiplayer.github.io/easier-elements-js/easier-elements.js"
import hljs from 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/highlight.min.js';
import lang_html from "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/languages/xml.min.js"

hljs.registerLanguage("html", lang_html)

const capture = event => event.stopPropagation()

const css = `
:host {
	display: grid;
	grid-auto-columns: 1fr;
	grid-auto-flow: column;
	gap: var(--padding, 1em);
	padding: var(--padding, 1em);
	position: relative;
}
@media (max-width: 60em) {
	:host {
		display: flex;
		flex-flow: column;
	}
}
.error {
	font-family: "Courier New", sans-serif;
	grid-column: span 2;
}
.error:empty { display: none; }
.error:not(:empty)~* { display: none; }
.hidden { display: none; }

html-preview {
	contain: inline-size layout style paint;
}

.edit {
	left: -1.4em;
	z-index: 10;
	position: absolute;
	display: block;
	content: '✎';
	line-height: 100%;
	opacity: .2;
	font-size: 2em;
	cursor: pointer;
}
.edit.editing {
	opacity: .6;
}
`
const theme = html.link({
	rel: "stylesheet",
	href: "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css"
})

element(class SkoomaShowcase extends HTMLElement {
	constructor() {
		super()
		this.attachShadow({mode: "open"})
		this.addEventListener("input", _ => {
			this.render()
		})
	}

	get editable() {
		return this.querySelector('[contenteditable="true"]')
	}

	format() {
		if (!this.editable) {
			const code = this.querySelector('[contenteditable]')
			code.innerHTML = hljs.highlight("javascript", code.innerText).value
		}
	}

	connectedCallback() {
		this.shadowRoot.replaceChildren(
			html.slot(),
			html.span("🖉", {
				class: "edit",
				click: ({target: button}) => {
					this.querySelectorAll("[contenteditable]")
						.forEach(item => {
							if (item.contentEditable == "true") {
								item.contentEditable = "false"
								button.classList.remove("editing")
								this.format()
							} else {
								item.contentEditable = "true"
								button.classList.add("editing")
								item.innerText = item.innerText
							}
						})
				}
			}),
			html.style(css),
			...Array.from(document.styleSheets).map(sheet => sheet.ownerNode.cloneNode(true)),
			theme.cloneNode(true),
			this.error = html.div({class: ["error"]}),
			this.output = html.code(),
			this.preview = html.htmlPreview({input: capture}),
		)
		this.format()
		this.render()
	}

	render() {
		const code = this.querySelector("code").innerText
		try {
			const fn = new Function("html", "empty", "State", code)
			const result = fn(html, empty, State)
			this.error.replaceChildren()
			this.output.innerHTML = hljs.highlight("html", result.outerHTML).value
			this.preview.classList.toggle("hidden", this.getAttribute("preview") === "false")
			this.output.classList.toggle("hidden", this.getAttribute("code") === "false")
			this.preview.replaceChildren(result)
		} catch (error) {
			console.error(error.stack)
			this.error.innerText = error.stack
		}
	}
})
