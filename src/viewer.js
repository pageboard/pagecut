module.exports = Viewer;

function Viewer(opts) {
	if (!opts) opts = {};
	this.doc = opts.document || document.implementation.createHTMLDocument();
	var modules = Object.assign({
		fragment: {
			view: function renderFragment(doc, block) {
				return block.content.fragment || doc.createElement("div");
			}
		},
		content: ContentModule
	}, global.Pagecut && global.Pagecut.modules, opts.modules);

	this.elements = opts.elements || [];
	this.modifiers = opts.modifiers || [];
	this.modifiers.unshift(typeModifier, foreignModifier);
	this.plugins = opts.plugins || [];

	var viewer = this;
	viewer.modules = {};

	Object.keys(modules).forEach(function(k) {
		var mod = modules[k];
		if (typeof mod == "function") {
			viewer.modules[k] = new modules[k](viewer);
		} else {
			mod.name = k;
			viewer.elements.push(mod);
		}
	});

	var map = this.map = {};
	for (var i=0; i < this.elements.length; i++) {
		map[this.elements[i].name] = this.elements[i];
	}
}

Viewer.prototype.render = function(block, edition) {
	var type = block.type;
	if (!type) throw new Error("Missing block type");
	var el = this.map[type];
	if (!el) throw new Error("Missing element " + type);
	var renderFn = edition && el.edit || el.view;
	if (!renderFn) throw new Error("Missing render function for block type " + type);
	block = this.copy(block, true);
	var dom = renderFn.call(el, this.doc, block);
	if (!dom) return "";
	var ndom = dom;
	if (ndom.nodeType != Node.ELEMENT_NODE) return ndom;
	for (var i=0; i < this.modifiers.length; i++) {
		ndom = this.modifiers[i](this, block, ndom) || ndom;
	}
	return ndom;
};

Viewer.prototype.copy = function(block, withDomContent) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	if (!withDomContent) delete copy.focused; // do not copy that attribute
	copy.content = Object.assign({}, block.content);
	var contents = copy.content;
	var name, content, div, frag, isNode;
	for (name in contents) {
		content = contents[name];
		if (!content) continue;
		isNode = content instanceof Node;
		if (withDomContent) {
			if (!isNode) {
				div = this.doc.createElement("div");
				div.innerHTML = content;
				frag = this.doc.createDocumentFragment();
				while (div.firstChild) frag.appendChild(div.firstChild);
				contents[name] = frag;
			}
		} else if (isNode) {
			var html = "";
			for (var i=0, child; i < content.childNodes.length; i++) {
				child = content.childNodes[i];
				if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
				else html += child.outerHTML;
			}
			contents[name] = html;
		}
	}
	return copy;
};

Viewer.prototype.merge = function(block, dom) {
	var contents = block.content;
	if (!contents) return;
	Object.keys(contents).forEach(function(name) {
		var blockContent = dom.getAttribute('block-content');
		var node;
		if (blockContent) {
			if (name == blockContent) node = dom;
		} else {
			node = dom.querySelector(`[block-content="${name}"]`);
		}
		if (!node) return;
		var content = contents[name];
		if (!content) return;
		node.appendChild(node.ownerDocument.importNode(content, true));
	});
};

function ContentModule(viewer) {
	viewer.modifiers.push(function contentModifier(viewer, block, dom) {
		return viewer.merge(block, dom);
	});
}

function typeModifier(viewer, block, dom) {
	if (!dom.hasAttribute('block-type')) dom.setAttribute('block-type', block.type);
}

function foreignModifier(viewer, block, dom) {
	var el = viewer.map[block.type];
	if (el && el.foreign) el.foreign(dom, block);
}
