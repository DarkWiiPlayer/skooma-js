# Skooma

A functional-friendly helper library for procedural DOM generation and
templating.

## Overview

```js
import {html} from "skooma.js"

document.body.append(html.div(
    html.h1("Hello, World!"),
    html.p("Skooma is cool", {class: "amazing"}),
    html.button("Show Proof", click: event => { alert("It's true!") })
))
```

## Interface / Examples

### HTML generation

```js
html.div()
// Creates a <div></div> element
html.div("hello", "world")
// <div>helloworld</div>
html.div(html.span())
// <div><span></span></div>
html.div([html.span(), html.span()])
// <div> <span></span> <span></span> </div>
html.div({class: "foo"})
// <div class="foo"></div>
html.div({class: ["foo", "bar"]})
// <div class="foo bar"></div>
html.div({click: 1})
// <div click="1"></div>
html.div({click: event => console.log(event.target)})
// Creates a <div> with an event listener for "click" events
html.div(player: {username: "KhajiitSlayer3564"})
// Creates a <div> with the attribute "player" set to a JSON-encoded Object
html.div("Old content", self => self.innerText = "Hello, World!")
// Creates a <div> and passes it to a function for further processing
html.div({foo: true})
// <div foo></div>
html.div({foo: "bar"}, {foo: false})
// <div></div>

// Special keys:

html.div({dataset: {foo: 1, bar: 2}})
// <div data-foo="1" data-bar="2"></div>

html.div({shadowRoot: html.span("Shadow root content")})
// Attaches a shadow root with a span
```

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

## bind

This function offers a generic mechanism for binding elements to dynamic state.
It takes a register function that satisfies the following criteria:

- It returns an initial state as an array
- It accepts a callback function
- On state change, it calls it with the new state as its arguments

And returns a second function, which takes a transformation (another functuion)
from input state to DOM node. This transformation will be used to create an
initial element from the initial state, which will be returned.

On every state change, the transform ation will be called on the new state to
generate a new DOM Node, which replace the current one.

```js
bind(register)(html.div)
// Returns a div element bound to register
// Assuming register is a higher order function
// and html.div is a transformation from input state to a <div> node
```

Since references to the bound element can become stale, a `current` property
is set on every element that returns the current element. This will keep working
even after several state changes.

## handle

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
