coed -- Editor with Components
==============================

[Demo](https://kapouer.github.io/coed/demo/index.html)

Helps setting up editable components in [ProseMirror](https://prosemirror.net),
with non-editable parts and named content with configurable schema.

Use `coed` to augment the editor with stylable DOM components and customizable
form inputs.

It comes pre-bundled with a "link" component that makes use of
[url-inspector](https://github.com/kapouer/url-inspector) for
insertion as resource, embed, or anchors.


Usage
-----

Simply add dist/coed.min.css, dist/coed.min.js to a web page and initialize the editor:

```
document.addEventListener('DOMContentLoaded', function() {
	var inspectorBase = "http://inspector.eda.sarl";

	var opts = {
		content: document.querySelector("#content"),
		place: document.querySelector("#editor"),
		components: [
			ImageList
		],
		inspector: function(info, cb) {
			var node = info.fragment && info.fragment.firstChild;
			if (node && node.nodeName == "IFRAME") {
				info.url = node.src;
				info.title = "Loading iframe at " + info.url;
			} else {
				node = null;
			}
			GET(inspectorBase + "/inspector", {
				url: info.url
			}, cb);
		}
	};
	var pm = Coed.init(opts);
	opts.content.hidden = true;
});
```

Components
----------

A component is an object that must implement this interface:

### Properties

- tag: the component tag name. Preferably custom, but does not need web components to work.
- name: the component name as seen by ProseMirror
- attrs: an object mapping attributes with default values, tells ProseMirror what must be stored on the component.
  Attributes are typically merged in the DOM instance of the component.
- contents: an object mapping content node names to ProseMirror schemaSpec

### Methods

- from(dom): returns attributes from a given DOM component node
- to(attrs): returns a DOM component instance given a set of attributes
  Nodes with editable content must have a unique `coed-name` attribute.
- init(pm): optional method that is called after pm initialization

Content nodes are entirely handled by ProseMirror - those two methods do not deal
with them at all.

A selected component gets a "focused" class.


Link Component
--------------

A component representing a resource of any kind (url or fragment).

Plugin options:
An `inspector` async function that receives an object with either url or fragment,
mutable properties.
Setting immediately the `title` property on that object will set the title of the
loading block, and the callback should receive the properties listed above
(which have the same format as url-inspector result).
The properties returned by that function are then used to render the DOM node,
parse it and insert it into the edited document.


ProseMirror customization
-------------------------

`Coed.defaults` contains `spec`, the schema specification that will be used to
initialize ProseMirror, and `plugins`, the list of prosemirror plugins needed
by Coed. Otherwise options passed to `Coed.init` are passed to ProseMirror
constructor.

