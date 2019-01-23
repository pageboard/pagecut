module.exports = Blocks;
var domify = require('domify');
function htmlToFrag(str, doc) {
	var node = domify(str, doc);
	if (node && node.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var frag = doc.createDocumentFragment();
		frag.appendChild(node);
		node = frag;
	}
	return node;
}

function Blocks(view, opts) {
	this.view = view;
	this.store = {};
	this.initial = {};
	if (opts.genId) this.genId = opts.genId;
}

Blocks.prototype.render = function(block, opts) {
	var type = opts.type || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown element type ${type}`);
	if (!opts) opts = {};
	if (!opts.scope) opts.scope = {};
	if (!opts.scope.$doc) opts.scope.$doc = this.view.doc;
	if (!opts.scope.$elements) opts.scope.$elements = this.view.elements;
	if (!opts.scope.$element) opts.scope.$element = el;

	block = Object.assign({}, block);
	block.data = Blocks.fill(el, block.data);
	var dom = el.render.call(el, block, opts.scope);
	if (dom && opts.merge !== false) this.merge(dom, block, type);
	return dom;
};

Blocks.prototype.mount = function(block, blocks, opts) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, view = this.view;
	if (contents) for (var name in contents) {
		content = contents[name];
		if (!(content instanceof Node)) {
			copy.content[name] = htmlToFrag(content, view.doc);
		}
	}
	var type = opts.type || copy.type;
	var el = view.element(type);
	if (!el) {
		console.error("Cannot find element for block type", type);
		return copy;
	}
	if (el.mount) el.mount(copy, blocks, opts);
	return copy;
};

Blocks.fill = function(schema, data) {
	if (!schema.properties) return data;
	// sometimes data can carry an old odd value
	if (data === undefined || typeof data == "string") data = {};
	else data = Object.assign({}, data);
	Object.keys(schema.properties).forEach(function(key) {
		var prop = schema.properties[key];
		if (prop.default !== undefined && data[key] === undefined) data[key] = prop.default;
		if (prop.properties) data[key] = Blocks.fill(prop, data[key]);
	});
	return data;
};

Blocks.prototype.copy = function(block) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	if (block.expr) copy.expr = Object.assign({}, block.expr);
	if (block.content) copy.content = Object.assign({}, block.content);
	delete copy.focused;
	return copy;
};

Blocks.prototype.merge = function(dom, block, overrideType) {
	if (dom.nodeType != Node.ELEMENT_NODE) return;
	var el = this.view.element(overrideType || block.type);
	var contents = block.content;
	if (!contents) return;
	if (!el.contents) return;
	if (el.inplace) return;
	if (typeof el.contents.spec != "string") Object.keys(el.contents).forEach(function(name) {
		var blockContent = dom.getAttribute('block-content');
		var node;
		if (blockContent) {
			if (name == blockContent) node = dom;
		} else if (el.inline) {
			node = dom;
		} else {
			node = dom.querySelector(`[block-content="${name}"]`);
		}
		if (!node) return;
		if (node.nodeName == "TEMPLATE") node = node.content;
		var content = contents[name];
		if (!content) return;
		if (typeof content == "string") {
			content = node.ownerDocument.createTextNode(content);
		} else if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			content = node.ownerDocument.importNode(content, true);
		} else {
			console.warn("cannot merge content", content);
			return;
		}
		node.textContent = "";
		node.appendChild(content);
	});
	else if (Object.keys(block.content).length) {
		console.warn("Cannot mount block", block);
	}
};

Blocks.prototype.from = function(block, blocks, opts) {
	// blocks can be a block or a map of blocks
	// if it's a block, it can have a 'children' property
	var view = this.view;

	var frag = "";
	if (typeof block == "string") {
		frag = block;
		block = null;
	}
	if (!blocks) {
		if (block && !block.type) {
			blocks = block;
			block = null;
		}
	}
	if (!blocks) blocks = this.initial = {};
	// it's a map of blocks, we need to find the root block
	if (!block) {
		var id = view.dom.getAttribute('block-id');
		if (!id) { // TODO remove this
			// can't rely on id plugin until view.dom changes are applied by a Step instance
			console.warn("root dom has no id !");
			id = this.genId();
			view.dom.setAttribute('block-id', id);
		}
		var contentName = view.dom.getAttribute('block-content') || 'fragment';
		block = blocks[id];
		if (!block) {
			block = {
				id: id,
				type: 'fragment',
				content: {}
			};
			block.content[contentName] = frag;
		}
	}
	var result = this.renderFrom(block, blocks, this.store, opts);
	return result;
};

Blocks.prototype.renderFrom = function(block, blocks, store, opts) {
	var view = this.view;
	if (!blocks) blocks = {};
	if (!opts) opts = {};
	block = this.mount(block, blocks, opts);
	if (block.id) {
		// overwrite can happen with virtual blocks
		if (!store[block.id]) store[block.id] = block;
	}
	var fragment;
	try {
		fragment = view.render(block, opts);
	} catch(ex) {
		console.error(ex);
	}
	if (block.children) {
		block.children.forEach(function(child) {
			if (!blocks[child.id]) {
				blocks[child.id] = child;
			} else {
				console.warn("child already exists", child);
			}
		});
		delete block.children;
	}
	if (!fragment || !fragment.querySelectorAll) return;

	var fragments = [fragment];
	Array.prototype.forEach.call(fragment.querySelectorAll('template'), function(node) {
		fragments.push(node.content);
	}, this);
	fragments.forEach(function(fragment) {
		Array.prototype.forEach.call(fragment.querySelectorAll('[block-id]'), function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var type = node.getAttribute('block-type');
			var child = blocks[id];
			if (!child) {
				console.warn("missing block for", node.parentNode.nodeName, '>', node.nodeName, id);
				node.parentNode.replaceChild(node.ownerDocument.createTextNode('·'), node);
				return;
			}
			var old = opts.type;
			opts.type = type;
			var frag = this.renderFrom(child, blocks, store, opts);
			opts.type = old;
			if (!frag) return;
			if (frag.attributes) {
				for (var i=0, att; i < node.attributes.length, att = node.attributes[i]; i++) {
					if (!frag.hasAttribute(att.name)) frag.setAttribute(att.name, att.value);
				}
			}
			node.parentNode.replaceChild(frag, node);
		}, this);
	}, this);
	return fragment;
};

