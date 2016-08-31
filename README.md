edbed -- Editable blocks editor
===============================

This html wysiwyg editor is designed to help handling of external resources in a document,
by displaying a "block" that represents the resource with these informations:

- type (link, image, video, embed)
- favicon
- title, summary, credit (and more)
- thumbnail
- duration
- dimensions
- file size

With the help of [prosemirror](https://prosemirror.net) and [url-inspector](https://github.com/kapouer/url-inspector), when a URL or html code is pasted, it is replaced by an such a "block".


Usage
-----

Simply add dist/edbed.min.css, dist/edbed.min.js to a web page and initialize the editor:

```
document.addEventListener('DOMContentLoaded', function() {
	var inspectorBase = "http://inspector.eda.sarl";

	var opts = {
		content: document.querySelector("#content"),
		place: document.querySelector("#editor"),
		inspector: function(info, cb) {
			var node = info.fragment && info.fragment.firstChild;
			if (node && node.nodeName == "IFRAME") {
				info.url = node.src;
				info.title = "Loading iframe at " + info.url;
			} else {
				node = null;
			}
			GET(inspectorBase + "/inspector", {url: info.url}, function(err, obj) {
				if (err) return cb(err);
				return cb(null, {
					type: obj.type,
					href: obj.url,
					icon: obj.icon,
					thumbnail: obj.thumbnail && (inspectorBase + obj.thumbnail) || null,
					title: obj.title,
					description: obj.description
				});
			});
		}
	};
	var pm = Edbed.init(opts);
	opts.content.hidden = true;
});
```

Options
-------

Options are passed to the underlying prosemirror editor.

`inspector` option must be specified as above, this function receives an object
with one of the following properties:
- url
- fragment (a non-empty document fragment with only Elements)

Setting immediately the `title` property on that object will set the title of
the loading block.

Properties
----------

- type: changes the appearance of the resource block, toggles default options
- icon, thumbnail, duration, dimensions, size: metadata about the resource
- html: the actual html code that will be displayed outside the editor

