coed -- Editor with Components
==============================

This html wysiwyg editor is designed to help handling of external resources in a document,
by displaying a "block" that represents the resource with these informations:

- url
- type (link, image, video, embed)
- favicon
- thumbnail
- duration
- dimensions (width, height)
- file size
- and some content like title, credit, ...

With the help of [prosemirror](https://prosemirror.net) and [url-inspector](https://github.com/kapouer/url-inspector), when a URL or html code is pasted, it is replaced by such a "block".


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

An Coed Component defines:
- a prosemirror plugin
- a custom tag
- a schema as a ProseMirror node
- how to render it as a DOM node
- how to parse it from a DOM node to a ProseMirror Node.

Typically, attributes of the root tag are used to render tags that are not part
of the prosemirror schema specification. Any attempt at selecting those tags
will result in selecting the root node.

A selected component gets a "focused" class.


Coed links
-----------

An Coed Component representing a resource of any kind (url or fragment).

Tag: ed-link

Schema:
ed-link[type, icon, thumbnail, duration, width, height, size, description, html]
	ed-link-content
		ed-link-section[name="title"]
		ed-link-section[name="content"]
		
Rendered:
ed-link
	ed-link-header
	ed-link-content
		ed-link-section[name="title"]
		ed-link-section[name="content"]
	ed-link-aside

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

