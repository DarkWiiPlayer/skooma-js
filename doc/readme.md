## Skooma.js

### HTML Proxy

The proxy object that does the actual HTML generation.

```js
document.body.append(html.div(
   html.span("Hello, World!")
))
```

### Handle helper

Wraps a funcion of the signature `event, ... -> value` so that
`event.preventDefault` gets called before running the function.

```js
button.addEventListener("click",
   handle(() => console.log("click"))
)
```

### Fragment helper

Wraps a list of elements in a new document fragment.

```js
const spans = fragment(
   html.span("First span"),
   html.span("Second span")
)
document.body.append(spans.cloneNode())
```

### Text helper

When called as a normal function, returns a new text node with the given
content. Unlike `document.createTextNode`, it does not fail for non-string
values.

```js
const node = text("Hello, World!")
```

When used as a tagged template, returns a document fragment containing text
nodes and interpolated values. DOM nodes can be interpolated into the document
fragment.

```js
const description = text`Interpolate ${html.b("bold")} text`
```

For consistency, even tagged templates with no interpolated variables will
always return a document fragment.

## State.js

### AbortRegistry

`FinalizationRegistry` that takes an `AbortController` and aborts it whenever
the registered value gets collected.

### ChangeEvent

The event class emitted when a change is detected on a skooma state.
Provides the `final` getter.

### MapStorage

A utility class that simulates the `Storage` API but is backed by a map. Can be
used as fallback in environments where persistent storages aren't available.

### SimpleState

Base state class that all other states inherit from, used primarily for class
checking, as the `State` class introduces behaviours that may be undesireable
when inheriting.

### State

The main state class that does all the magic.

### ForwardState

Proxy to a named property on another State to be used with APIs that only accept
single-value states.

### StoredState

State class that is backed by a Storage instead of an internal proxy.

## domLense.js
