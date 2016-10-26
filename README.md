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
	var inspectorBase = "https://inspector.eda.sarl";

	var coLink = new Coed.Link({
		inspector: function(info, cb) {
			// info is mutable
			var node = info.fragment && info.fragment.firstChild;
			if (node && node.nodeName == "IFRAME") {
				info.title = info.url = node.src;
			}
			// url-inspector-daemon@1.5.0 has right properties names
			GET(inspectorBase + "/inspector", {url: info.url}, cb);
		}
	});

	var coed = new Coed.Editor({
		place: document.querySelector("#editor"),
		components: [coLink]
	});
	var domContent = document.querySelector("#content");
	coed.set(domContent);
	domContent.hidden = true;
});
```


Methods
-------

- new Coed.Editor(opts)  
  returns an editor instance,
  options are documented below in Defaults section.
- coed.set(dom, fn)  
  sets editor content DOM.  
  Optional fn(component, dom) can override `component.from` by returning block data.
- coed.get(fn)  
  gets editor content DOM.  
  Optional fn(component, dom, data, content) is called right after dom is
  returned by output.

- coed.insert(dom, selection?)  
  replace selection or current selection with dom node.
- coed.delete(selection?)  
  delete selection or current selection.
- coed.parse(dom, selection?)  
  parse a dom node as if it was pasted into selection, useful for components,
  and called by `insert`.
- coed.merge(dom, contents)  
  merges contents object by filling nodes matching `block-content` attribute name.
- coed.refresh(dom)  
  refresh data collected from a DOM node and synchronize the editor.
- coed.toBlock(node, withoutContent)  
  returns a block from an editor node (not a DOM node).  
  The `withoutContent` boolean argument prevents it from collecting contents.

`selection` parameter is a prosemirror's Selection instance.


Properties
----------

coed instance conveniently exposes underlying prosemirror editor modules:
Menu, Commands, State, Transform, Model, Pos (from dompos), keymap.


Blocks
------

A block is an object representing a component instance. It is not explicitely
used by `coed` but its the main concept of the editor.

A block is
- type: the component name that can handle that block
- data: an object mapping names to values
- content: an object mapping names to html content


Options
-------

Coed.Editor options.
- action(coed, action): called upon each action  
  if it returns true, the action is not applied to the editor view.  
  This gives a way to override underlying editor onAction event.
- change(coed, block): called when a block has changed  
  the ancestor block, if any, in which the current action is applied.

`Coed.defaults` stores some useful default values:
- spec: a default, mutable, schema spec
- plugins: array of plugins for ProseMirror
- components: array of components like Coed-Link
- menu: function(coed, items) { return items.fullMenu; }
- content: a DOM node, similar to a call to `coed.set`


Components
----------

A component is an object that must expose the properties and methods defined
below.

A component instance must also call `coed.refresh(dom)` when
something else than the editor changed its DOM.

### Properties

- name  
  the component name as seen by ProseMirror.
- dataSpec  
  an object mapping data names with default values or validation functions,
  tells ProseMirror what data can be stored on the component instance.
- contentSpec  
  an object mapping content node names to ProseMirror schemaSpec.

Data values are typically (but not necessarily all) merged in the DOM instance
of the component. They are distinct from the attributes defined by a component
template root DOM node, for example `dataSpec.class` won't override the
template's root DOM node `class` attribute and its initial default value.


### Methods

- from(dom)  
  returns block's data from a given DOM Node for edition.
- to(data)  
  returns DOM for edition from a block's data.  
  Nodes with editable content must have a `block-content` attribute.
- plugin(coed)  
  returns a plugin object, optional.
- output(coed, data, content)  
  returns DOM for publication from block's data and content.  
  Here `content[name]` is the node having the `block-content` attribute.


### Attributes

- block-content  
  a component must set this attribute on editable nodes, with a name matching
  contentSpec's component.
- block-handle  
  a component must set this attribute on non-editable nodes that can be used
  for dragging a block.
- block-focused  
  this attribute is set on a block when it is focused.


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

