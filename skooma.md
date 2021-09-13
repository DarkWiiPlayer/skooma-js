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

html.div(dataset: {foo: 1, bar: 2})
// Creates a <div> with the attributes "data-foo" and "data-bar" set to 1 and 2
html.div(style: {color: 'red'})
// Creates a <div> with the "style" attribute set to "color: red"
```

Generators can be called with many arguments. Arrays get iterated recursively as
if they were part of a flat argument list.
