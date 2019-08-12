pagecut -- Extensible web content editor
========================================

Warning: this is a work in progress,
[not to be used before 1.0](https://github.com/pageboard/pagecut).

It is mostly meant to be used by [pageboard](https://github.com/pageboard),
with a lot of elements already [defined here](https://github.com/pageboard/client/tree/master/packages).

pagecut tries to make prosemirror schema definition more intuitive, powerful, and close to html definitions.

See pageboard documentation (when it's available...).

Objects
-------

* Viewer  
  renders blocks to DOM using elements and modifiers.

* Editor  
  parse DOM into blocks using resolvers, render blocks into DOM (edit version),
  parse that DOM into an internal editor object model, which is in turn used
  by prosemirror to render that internal model into a DOM view.

* Elements  
  Blocks are instances of elements.  
  An element comes in two parts:  
  - its definition (name, group, contents, and json schema properties)
  - its edit and view methods, with signatures (document, block).

* Blocks  
  The core data structure for holding elements instances, and persisting content.
  A block has an type, content, data, and an optional id.

A block can be rendered to DOM using `pagecut.render(block, forEdition)`.
An editor instance can be rendered to DOM using `pagecut.get()`.


Basic setup
-----------

Bunbled files are available as
- dist/editor.js (already containing the viewer)
- dist/viewer.js (for view-only purpose)
- dist/editor.css (for editor)

A basic editor setup without anything interesting:

```
var pagecut = new Pagecut.Editor({
	place: '#editable',
	content: document.querySelector('.some.selector')	
});
```

Yet such a setup isn't really useful without modules.


Elements
--------

An element is a simple object with properties and methods, and must be added
to the `elements` array, mapping types to elements.

Mandatory property:
- name  
  the element type name

Properties for the editor:
- group (optional)  
  the group as defined by the prosemirror editor
- contents  
  an object matching contents names to an object having a 'spec' property being
  a [prosemirror content expression](http://prosemirror.net/guide/schema.html).  
  Or, `contents` can be a string, meaning content is not labelled.
  ```
    { id: "<id>", nodes: "<spec>", marks: "<marks>"}
    <div class="parent"><div block-content="<id>"><p>Default Content</p></div></div>
  ```
  
- inplace  
  A boolean indicating the block is not stored, implying it is entirely defined
  by its DOM representation.
- inline  
  A boolean indicating the block has only one content (what's inside its tag),
  and that this content is stored in place, not in the block. The attributes
  are still kept in the block.

Properties for content management:
- properties  
  a json schema object defining the format of block's data object,
  but can actually only hold strings (empty string being the default value).
- required or other json-schema keywords  
  anything being optional here

Mandatory viewing method:
- view(document, block)  
  renders a block to DOM

Methods for editing:
- edit(document, block)  
  optional, defaults to view().  
  renders a block to editable DOM.

The `edit` method must return a DOM with `block-content` attributes placed on
DOM Nodes that have editable content, and does not need to actually merge the
block content into it (it's done automatically).

The `view` method, on the other hand, can merge the content the way it wants,
or add `block-content` attributes and let the merge be done automatically.

It can also place a `block-handle` boolean attribute on a DOM Node to facilitate
selection and drag and drop of the block DOM representation.


Blocks
------

A simple object with:
- type
- data object
- content object (mapping names with content)

and optionally, some extensions:
- id (used by id module)
- focused (used by focus modifier)
- foreign: the block is not editable and the element defining the block exports
a `foreign(dom, block)` function that can change the dom content.

Application data should be stored in the data object, but the block object itself
can be used to store runtime variables like these.

The content object holds html content, which itself can be in two states:
- serialized, as html text, with unresolved sub-blocks in it
- parsed as DOM with resolved sub-blocks in it

When serializing to blocks, it is essential to also get all the blocks that
where (un)resolved by the resolvers, or else it's like getting a tree without
its apples. See the "id module" below.


Modifiers
---------

After an element renders a block, *modifiers* can act upon the returned DOM node.
A modifier is a function(main, block, dom) {} that returns nothing.

Typical modifiers:
- add a block-id attribute if block.id is set
- add a block-focused attribute if block.focused is set

Pagecut.Editor
--------------

Pagecut main editor instance conveniently exposes underlying prosemirror editor
modules: Menu, Commands, State, Transform, Model, Pos (from dompos), keymap.


Pagecut.Editor options:
- update(main, transaction): called upon each transaction  
  if it returns true, the transaction is not applied to the editor view.  
  This gives a way to override underlying editor dispatchTransaction event.
- change(main, block): called when a block has changed  
  the ancestor block, if any, in which the current action is applied.

Pagecut.Editor.defaults holds some default options values:
- marks, nodes: the schema specifications
- plugins: array of plugins for ProseMirror
- menu: function(coed, items) { return items.fullMenu; }

Pagecut.Editor methods:
- set(dom) - set the dom content of the editor
- get(edition) - get the dom content of the editor


Pagecut.Viewer
--------------

An instance of viewer is created by default by an instance of Pagecut.Editor.
Its purpose it to keep track of elements and resolvers, and mainly to render
blocks to DOM using `render` method.

A separate instance can be created using `new Pagecut.Viewer(opts)` where opts:
- document: a DOM Document (a new one is created if none is given)


* render(block, edition) returns a DOM node  
  Calls the element edit or view function, and modifiers.
  Merges content. Not recursive.

A default `fragment` type is available to be able to render a fragment of html:
```
var domWrapper = pagecut.render({
	type: 'fragment',
	content: {fragment: 'some html <p>string</p>'}
});
// domWrapper.innerHTML == 'some html <p>string</p>'
```

Prosemirror modules
-------------------

The Prosemirror modules that are used by Editor are accessible through
Pagecut variable.


The id module
-------------

The id module provides:
- IdResolver for edition that maps block-id attributes values to blocks stored
in a shared cache,

- IdModifier for edition that adds block-id attributes when block.id is defined,

- id.to(store?) returns a block fragment of the editor root content, and
  optionally populates store with the blocks (by id) that have been referenced.
  id.to also calls elements's to() function if present, and do not add blocks to
  the root.children list when they have a true `orphan` property.

- id.from(block or html, store, resolver?) renders the block, searches *all*
  descendents with a `block-id` attribute in the store, and if it doesn't find
  a matching block, optionally calls the resolver(id) function which can return
  a promise, then replaces each block with its rendered DOM.
  The async resolver allows one to fetch remote data during initial rendering
  of the view. It's similar (but different in the details and applications) to
  the editor's resolvers functions.  
  It's up to the custom resolver to store fetched blocks in the id module cache.  
  Returns a promise that resolves to a DOM node.

