var state = require("prosemirror-state");
var model = require("prosemirror-model");

var UrlRegex = require('url-regex');

function CreateUrlPlugin(options) {
	var urlHandler = new UrlHandler(options);
	return new state.Plugin({
		props: {
			transformPasted: urlHandler.filter
		}
	});
}

function UrlHandler(options) {
	this.components = options.components;
	this.filter = this.filter.bind(this);
}

UrlHandler.prototype.filter = function(slice) {
	return new model.Slice(this.transform(slice.content), slice.openLeft, slice.openRight);
};

UrlHandler.prototype.transform = function(fragment) {
	var linkified = [];
	var urlReg = UrlRegex();
	for (var i = 0; i < fragment.childCount; i++) {
		var child = fragment.child(i);
		var newNode = null, jComp;
		if (child.isText) {
			var frog = asForeignFragment(child.text.trim());
			if (hasOnlyChildElements(frog)) {
				for (var j = 0; j < this.components.length; j++) {
					jComp = this.components[j];
					if (jComp.input) newNode = jComp.input(frog);
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
					for (var j = 0; j < this.components.length; j++) {
						jComp = this.components[j];
						if (jComp.input) newNode = jComp.input(urlText);
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
	return model.Fragment.fromArray(linkified);
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

module.exports = CreateUrlPlugin;

