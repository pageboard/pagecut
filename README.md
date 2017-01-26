pagecut -- Extensible web content editor
========================================

[Demo](https://kapouer.github.io/pagecut/demo/index.html)

An easy to setup and easy to extend html content editor built upon
[ProseMirror](https://prosemirror.net).


Main concepts
-------------

* Viewer  
  renders blocks to DOM using resolvers and elements.

* Editor  
  transform blocks into internal editor representation and render them for edition.

* Resolvers  
  Return synchronously and/or asynchronously a block from a url or from a dom node.

* Elements  
  Blocks are instances of elements.  
  An element comes in two parts:  
  - its definition (name, group, specs, and json schema)
  - its edit and view methods, with signatures (main, block).

* Modules  
  A simple extension system for defining resolvers and elements.
  A module exports a function `Pagecut.modules.mymodulename(elements, resolvers)`.

* Blocks  
  The core data structure for holding elements instances, and persisting content.
  A block has an type, content, data, and an optional id.

A block can be rendered to DOM using `pagecut.render(block, forEdition)`.
An editor instance can be rendered to DOM using `pagecut.get()`.


Basic setup
-----------

Bunbled files are available as
- dist/pagecut-editor.js (already containing the viewer)
- dist/pagecut-viewer.js (for view-only purpose)
- dist/pagecut.css (for editor)

A basic editor setup without anything interesting:

```
var pagecut = new Pagecut.Editor({
	place: '#editable',
	content: document.querySelector('.some.selector')	
});
```

Yet such a setup isn't really useful without modules.


Modules
-------

The function exported by a module as `Pagecut.modules.<name>` can set up:
- elements
- resolvers
- modifiers

Example:
```
module.exports = function(main) {
	main.elements.video = VideoElement;
	main.resolvers.youtube = YoutubeResolver;
	main.modifiers.oddity = MyOwnModifier;
};
```
and is typically exported using browserify:
```
browserify --standalone Pagecut.modules.video modules/video.js
```

The order of modules, and in particular, the order of resolvers or modifiers,
should not change the result - be sure to define independent functions that
can be run in any order.


Resolvers
---------

Elements convert blocks to DOM, and resolvers are there to do the reverse.

A resolver is a `function(main, obj, cb)`,
- that can return a block immediately. That block gets a unique `id` if it
  doesn't already have one.
- that can return a block asynchronously using `cb(err, block)`;
- the synchronous block is automatically replaced by the asynchronous block

obj can have obj.url or obj.node, depending on wether a url was pasted or a
node is being processed.

A typical module will use `block-id` DOM attribute to store the block id and
keep track of its modifications, so it can later restore the original block.


Elements
--------

As explained before, an element is a simple object with properties and methods.

Properties:
- name  
  the element type name
- group (optional)  
  the group as defined by the prosemirror editor
- properties  
  a json schema object defining the format of block's data object,
  but can actually only hold strings (empty string being the default value).
- more json-schema stuff  
  anything being optional at that level.
- specs  
  an object matching contents names to
  [prosemirror content expression](http://prosemirror.net/guide/schema.html).

Methods:
- view(main, block)  
  renders a block to DOM
- edit(main, block)  
  renders a block to editable DOM

The `edit` method must return a DOM with `block-content` attributes placed on
DOM Nodes that have editable content.

It can also place a `block-handle` boolean attribute on a DOM Node to facilitate
selection and drag and drop of the block DOM representation.

Only the edit method is mandatory, if the view method is not defined, it falls
back to using the edit method (when rendering to DOM).


Blocks
------

A simple object with:
- type
- data object
- content object

and optionally, for internal use:
// TODO this could be handled by a modifier
- focused

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
- merge content automatically if block.content has properties


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

Pagecut.Editor global variable holds some default options values:
- markSpec, nodeSpec: the schema specifications
- plugins: array of plugins for ProseMirror
- menu: function(coed, items) { return items.fullMenu; }

Pagecut.Editor methods:
- set(dom) - sets the content of the editor using this dom
- get() - gets the content of the editor for viewing


Pagecut.Viewer
--------------

An instance of viewer is created by default by an instance of Pagecut.Editor.
Its purpose it to keep track of elements and resolvers, and mainly to render
blocks to DOM using `render` method.


The id module
-------------

The id module provides
- a resolver that maps block-id attributes values to blocks stored in a shared
cache
- a modifier that adds block-id attributes when block.id is defined
- an export function that returns the shared cache of all blocks with the blocks
in their contents replaced by a single `div block-id=xxx` tag.

Though the edited document is not itself a block, it helps to think of it as
a "document" block, so the export function can return:
```
{
	id: 'document',
	type: 'document',
	content: {
		document: 'the document content'
	}
}
```

