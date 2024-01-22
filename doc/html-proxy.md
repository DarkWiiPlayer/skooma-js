# Skooma.js

```js
import {html} from "skooma.js"
```

A functional-friendly helper library for procedural DOM generation and templating, with support for reactive state objects.

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

### Basic DOM generation

Accessing the `html` proxy with any string key returns a new node generator function. When called this function will generate a DOM node (HTML Tag). The name of the function becomes the tag name of the node.

```js
html.div()
```

Content and attributes can be set via the function arguments: Strings and DOM nodes are inserted as children, while other objects (except for some special cases) have their key-value pairs turned into attribute-value pairs on the 

```js
html.div("Big Text", {style: "font-size: 1.4em"})
```

Arrays, including nested ones, are iterated, and their values treated as arguments. This works both for inserting children and setting attributes.

```js
const content = [" ps: hi", {class: "title"}]
html.h1({id: "main-heading"}, "Heading", content)
```

Function arguments are treated differently depending on their length: Functions with **no** named parameters are called, and their return value is then evaluated just like an argument to the generator.

All other functions are (immediately) called with the newly created node as their first and only argument. These can be used to initialise the new node in a point-free style.

```js
const hello = () => html.bold("Hello, World!")
const init = node => console.log("Initialising", node)
html.div(hello, init)
```

Nested tags can be generated with nested function calls. When properly formatted, this means simpler templates will have the same structure as if written in HTML (sans those pesky closing tags).

```js
html.div(
    html.p(
        html.b("Bold Text")
    )
)
```

### Attribute Processing

For convenience, arrays assigned as attributes will be joined with spaces:

```js
html.a({class: ["button", "important"]})
```

Assigning a function as an attribute will instead attach it as an event listener:

```js
html.button("Click me!", {click: event => {
    alert("You clicked the button.")
}})
```

The special `style` property can be set to an object and its key/value pairs will be inserted as CSS properties on the element's `style` object.

```js
const style = { color: "salmon" }
html.span("Salmon", { style })
```

The special property `shadowRoot` will attach a shadow-DOM to the element if none is present and append its content to the shadow root. Arrays are iterated over and their elements appended individually.

```js
html.div({
   shadowRoot = ["Hello, ", html.b("World"), "!"]
})
```

The `dataset` property will add its key/value pairs to the new node's `dataset`, as a more convenient alternative to setting individual `data-` attributes.

```js
const dataset = { foo: "bar" }
const div = html.div({dataset})
console.log(dataset.foo === div.dataset.foo)
console.log(div.getAttribute("data-foo") === "bar")
```

### Reactivity

Skooma generator functions have a simple concept of reactive state: Any value that

1. Is not an `HTMLElement`
2. Is an `EventTarget`
3. Has a `value` attribute

When such a value is found where an attribute value or a child element would be expected, then its `value` is used instead, and a "change" event listener is added to the reactive state that either updates the property or replaces the child element respectively.

