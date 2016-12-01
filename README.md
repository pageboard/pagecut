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
	function inspectorCallback(info, cb) {
		// info is mutable
		var node = info.fragment && info.fragment.firstChild;
		if (node && node.nodeName == "IFRAME") {
			info.title = info.url = node.src;
		}
		// url-inspector-daemon@1.5.0 has right properties names
		GET("https://inspector.eda.sarl/inspector", {
			url: info.url
		}, cb);
	}

	var coed = new Coed({
		place: "#editor", // can also be a DOM Node
		components: [Coed.link]
	}, {
		link: {
			inspector: inspectorCallback
		}
	});
	
	var domContent = document.querySelector("#content");
	coed.set(domContent);
	domContent.hidden = true;
});
```


Methods
-------

External usage

- new Coed(opts, componentsOpts)  
  returns an editor instance,
  options are documented below in Defaults section.
- coed.set(dom, fn)  
  sets editor content DOM.  
  Optional fn(component, dom) can override `component.from` by returning block data.
- coed.get(fn)  
  gets editor content DOM.  
  Optional fn(component, dom, data, content) is called right after dom is
  returned by output.


Internal usage

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
- coed.posFromDOM(dom)  
  Wrapper function, returns an internal prosemirror position of the given dom node.

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

Coed options.
- action(coed, action): called upon each action  
  if it returns true, the action is not applied to the editor view.  
  This gives a way to override underlying editor onAction event.
- change(coed, block): called when a block has changed  
  the ancestor block, if any, in which the current action is applied.

Coed global variable stores some useful default values:
- spec: a default, mutable, schema spec
- plugins: array of plugins for ProseMirror
- components: array of self-registered components like CoedLink
- menu: function(coed, items) { return items.fullMenu; }
- content: a DOM node, similar to a call to `coed.set`


Components
----------

A component is a class that exposes the static properties and instance methods
defined below.

A component must add itself to Coed.components array and create it if it is
missing:
```
if (!global.Coed) global.Coed = { components: [] };
global.Coed.components.push(CoLink);
```

Options are passed to component instances in the second argument of Coed
constructor.

> a component prototype must have default values for the properties

> A component instance must also call `coed.refresh(dom)` when
> something else than the editor changed its DOM.

### Properties

- name  
  the component name as seen by ProseMirror.
- group  
  the prosemirror group, defaults to 'block'
- properties  
  an object mapping properties names to json schema,
  tells ProseMirror what data can be stored on the component instance.  
  By default only the default value of the schema is actually useful.
- required  
  reserved, not implemented.  
  an array of required properties, as in json schema.  
- specs  
  an object mapping content node names to ProseMirror schemaSpec.

> do not confuse root dom node attributes and component data


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
  this attribute is set on a block root dom when it is focused.
- block-type  
  this attribute is set on a block root dom to store its component type name.


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

`Coed.spec` is the schema specification that will be used to
initialize ProseMirror, and `Coed.plugins`, the list of prosemirror plugins
needed by Coed.
These options are passed to ProseMirror constructor:
- place
- schema
- plugins
- content

