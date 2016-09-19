const {Plugin} = require("prosemirror/dist/edit");
const {Slice, Fragment} = require("prosemirror/dist/model");

const UrlRegex = require('url-regex');

function UrlPlugin(pm, options) {
	this.handlers = options.handlers;
	this.pm = pm;
	this.filter = this.filter.bind(this);
	pm.on.transformPasted.add(this.filter);
}

UrlPlugin.prototype.detach = function(pm) {
	pm.on.transformPasted.remove(this.filter);
};

UrlPlugin.prototype.filter = function(slice) {
	return new Slice(this.transform(slice.content), slice.openLeft, slice.openRight);
};

UrlPlugin.prototype.transform = function(fragment) {
	var linkified = [];
	var urlReg = UrlRegex();
	for (var i = 0; i < fragment.childCount; i++) {
		var child = fragment.child(i);
		var newNode = null;
		if (child.isText) {
			var frog = asForeignFragment(child.text.trim());
			if (hasOnlyChildElements(frog)) {
				for (var j = 0; j < this.handlers.length; j++) {
					newNode = this.handlers[j](this.pm, { fragment: frog });
					if (newNode) break;
				}
				if (newNode) {
					linkified.push(newNode);
					continue;
				}
			} else {
				var pos = 0, m;
				while (m = urlReg.exec(child.text)) {
					var start = m.index;
					var end = start + m[0].length;
					var link = child.type.schema.marks.link;
					if (start > 0) linkified.push(child.copy(child.text.slice(pos, start)));
					var urlText = child.text.slice(start, end);
					for (var j = 0; j < this.handlers.length; j++) {
						newNode = this.handlers[j](this.pm, { url: urlText });
						if (newNode) break;
					}
					if (!newNode) {
						newNode = child.type.create(null, urlText, link ? link.create({href: urlText}).addToSet(child.marks) : null);
					}
					linkified.push(newNode);
					pos = end;
				}
				if (pos < child.text.length) linkified.push(child.copy(child.text.slice(pos)));
			}
		} else {
			linkified.push(child.copy(this.transform(child.content)));
		}
	}
	return Fragment.fromArray(linkified);
};

function hasOnlyChildElements(fragment) {
	var allElems = true;
	var len = fragment.childNodes.length;
	var node;
	var count = 0;
	for (var i = 0; i < len; i++) {
		node = fragment.childNodes[i];
		if (node.nodeType == Node.TEXT_NODE && !node.nodeValue.trim()) continue;
		if (node.nodeType != Node.ELEMENT_NODE) {
			allElems = false;
			break;
		}
		count++;
	}
	if (!count) allElems = false;
	return allElems;
}

function asForeignFragment(str) {
	var fragment;
	// template content has a new registry of custom elements
	// http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries
	if (typeof HTMLTemplateElement == 'function') {
		var template = document.createElement('template');
		if (template.content && template.content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			fragment = template.content;
		}
	}
	if (!fragment) {
		var doc;
		if (document.implementation && document.implementation.createHTMLDocument) {
			doc = document.implementation.createHTMLDocument('');
		} else {
			throw new Error("Do not parse html using live document");
		}
		fragment = doc.createDocumentFragment();
	}
	var div = fragment.ownerDocument.createElement("div");
	div.innerHTML = str;
	while (div.firstChild) fragment.appendChild(div.firstChild);
	return fragment;
}

module.exports = new Plugin(UrlPlugin);

