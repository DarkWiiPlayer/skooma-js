# Skooma.js

```js
import {html} from "skooma.js"
```

A functional-friendly helper library for procedural DOM generation and
templating, with support for reactive state objects.

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

Accessing the `html` proxy with any string key returns a new node generator function:

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

Assigning a function as an attribute will instead attach it as an event listener:

```js
html.button("Click me!", {click: event => {
    alert("You clicked the button.")
}})
```

<!-- TODO: Document special keys -->

Generators can be called with many arguments. Arrays get iterated recursively as if they were part of a flat argument list.

