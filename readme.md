# Skooma

A functional-friendly helper library for procedural DOM generation and
templating.

```js
import {html} from "skooma/state.js"
```

## Warning

**This branch is in the process of being aggressively refactored and improved.
This readme file may not reflect the latest state of the interface.**

## Overview

```js
const text = new State({value: "Skooma is cool"})
setTimeout(() => {text.value = "Skooma is awesome!"}, 1e5)

document.body.append(html.div(
    html.h1("Hello, World!"),
    html.p(text, {class: "amazing"}),
    html.button("Show Proof", {click: event => { alert("It's true!") }})
))
```

## Interface / Examples

### Basic DOM generatio

Accessing the `html` proxy with any string key returns a new node generator
function:

```js
html.div("Hello, World!")
```

Attributes can be set by passing objects to the generator:

```js
html.div("Big Text", {style: "font-size: 1.4em"})
```

Complex structures can easily achieved by nesting generator functions:

```js
html.div(
    html.p(
        html.b("Bold Text")
    )
)
```

For convenience, arrays assigned as attributes will be joined with spaces:

```js
html.a({class: ["button", "important"]})
```

Assigning a function as an attribute will instead attach it as an event
listener:

```js
html.button("Click me!", {click: event => {
    alert("You clicked the button.")
}})
```

<!-- TODO: Document special keys -->

Generators can be called with many arguments. Arrays get iterated recursively as
if they were part of a flat argument list.

### Generating Text Nodes

```js
text("Hello, World")
// Wraps document.createTextNode
text()
// Defaults to empty string instead of erroring
text(null)
// Non-string arguments still error

text`Hello, World!`
// returns a new document fragment containing the text node "Hello, World!"
text`Hello, ${user}!`
// returns a document fragment containing 3 nodes:
// "Hello, ", the interpolated value of `user` and "!"
text`Hello, ${html.b(user)}!`
// Text node for Hello, the <b> tag with the user's name, and a text node for !
```

## handle

```js
import {handle} from 'skooma/state.js'
```

Since it is common for event handlers to call `preventDefault()`, skooma
provides a helper function called `handle` with the following definition:

```js
fn => event => { event.preventDefault(); return fn(event) }
```

## A few more examples:

Create a Button that deletes itself:

```js
document.body.append(
	html.button("Delete Me", {click: event => event.target.remove()})
)
```

Turn a two-dimensional array into an HTML table:
```js
const table = rows =>
	html.table(html.tbody(rows.map(
		row => html.tr(row.map(
			cell => html.rd(cell, {dataset: {
				content: cell.toLowerCase(),
			}})
		))
	)))
```

A list that you can add items to
```js
let list, input = ""
document.body.append(html.div([
	list=html.ul(),
	html.input({type: 'text', input: e => input = e.target.value}),
	html.button({click: event => list.append(html.li(input))}, "Add"),
]))
```

A list that you can also delete items from
```js
const listItem = content => html.li(
	html.span(content), " ", html.a("[remove]", {
		click: event => event.target.closest("li").remove(),
		style: { cursor: 'pointer', color: 'red' },
	})
)
let list, input = ""
document.body.append(html.div([
	list=html.ul(),
	html.input({type: 'text', input: e => input = e.target.value}),
	html.button({click: event => list.append(listItem(input))}, "Add"),
]))
```
