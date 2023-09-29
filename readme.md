# Skooma

A functional-friendly helper library for procedural DOM generation and
templating.

Skooma provides two proxies: `html` and `svg`.

## Interface / Examples

```js
html.div()
// Creates a <div> element
html.div("hello", "world")
// Creates a <div> element with the content "helloworld"
html.div(html.span())
// Creates a <div> element with a nested <span> element
html.div([html.span(), html.span()])
// Creates a <div> element with two nested <span> elements
html.div({class: "foo"})
// Creates a <div> with the class "foo"
html.div({class: ["foo", "bar"]})
// Creates a <div> with the classes "foo" and "bar"
html.div({click: 1})
// Creates a <div> with the attribute "click" set to "1"
html.div({click: event => console.log(event.target)})
// Creates a <div> with an event listener for "click" events
html.div(player: {username: "KhajiitSlayer3564"})
// Creates a <div> with the attribute "player" set to a JSON-encoded Object
html.div(self => self.innerHTML = "Hello, World!")
// Creates a <div> and passes it to a function that sets its inner HTML
html.div({foo: true})
// Creates a <div>, adds the attribute "foo"
html.div({foo: "bar"}, {foo: false})
// Creates a <div>, sets the "foo" attribute to "bar", then removes it again

// Special keys:

html.div(dataset: {foo: 1, bar: 2}) // Creates a <div> with the attributes "data-foo" and "data-bar" set to 1 and 2 html.div(style: {color: 'red'}) // Creates a <div> with the "style" attribute set to "color: red"
```

Generators can be called with many arguments. Arrays get iterated recursively as
if they were part of a flat argument list.

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
```

When used with templates, `text` tries to append any interpolated values into
the document fragment as is and without checking them.

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
