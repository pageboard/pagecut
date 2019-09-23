module.exports = Blocks;
var domify = require('domify');
function htmlToFrag(str, doc) {
	var node;
	try {
		node = domify(str, doc);
	} catch(err) {
		console.error(err);
	}
	if (node && node.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var frag = doc.createDocumentFragment();
		frag.appendChild(node);
		node = frag;
	}
	return node;
}

function Blocks(view, opts) {
	this.view = view;
	this.store = opts.store || {};
	if (opts.genId) this.genId = opts.genId;
}

Blocks.prototype.render = function(block, opts) {
	var type = opts.type || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown element type ${type}`);
	if (!opts) opts = {};
	var scope = opts.scope || this.view.scope || {};
	if (!scope.$doc) scope.$doc = this.view.doc;
	if (!scope.$elements) scope.$elements = this.view.elements;
	if (!scope.$element) scope.$element = el;

	block = Object.assign({}, block);
	block.data = Blocks.fill(el, block.data);
	var dom = el.render.call(el, block, scope);
	if (dom && opts.merge !== false) this.merge(dom, block, type);
	return dom;
};

Blocks.prototype.mount = function(block, blocks, opts) {
	var type = opts.type || block.type;
	var el = this.view.element(type);
	if (!el) return;
	el.contents.normalize(block);
	var copy = this.copy(block);
	var doc = this.view.doc;

	el.contents.each(block, function(content, def) {
		if (!(content instanceof Node)) {
			el.contents.set(copy, def.id, htmlToFrag(content, doc));
		}
	});
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
	if (block.lock) copy.lock = Object.assign({}, block.lock);
	if (block.content) copy.content = Object.assign({}, block.content);
	delete copy.focused;
	return copy;
};

Blocks.prototype.merge = function(dom, block, overrideType) {
	if (dom.nodeType != Node.ELEMENT_NODE) return;
	var el = this.view.element(overrideType || block.type);
	if (el.inplace) return;
	if (!block.content) return;
	el.contents.each(block, function(content, def) {
		if (!content) return;
		var node;
		if (!def.id || def.id == dom.getAttribute('block-content') || el.inline) {
			node = dom;
		} else {
			node = dom.querySelector(`[block-content="${def.id}"]`);
		}
		if (!node) return;
		if (node.nodeName == "TEMPLATE") node = node.content;
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
};

Blocks.prototype.from = function(block, blocks, opts) {
	this.rootId = block.id;
	if (!blocks) blocks = {};
	return this.renderFrom(block, blocks, this.store, opts);
};

Blocks.prototype.renderFrom = function(block, blocks, store, opts) {
	if (!block.type) return;
	var view = this.view;
	if (!blocks) blocks = {};
	if (!opts) opts = {};
	block = this.mount(block, blocks, opts);
	if (!block) return;
	if (block.id) {
		// overwrite can happen when (re)loading virtual blocks
		var oldBlock = store[block.id];
		if (!oldBlock || oldBlock.type == block.type) store[block.id] = block;
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
			var parent = node.parentNode;
			var child = blocks[id];
			if (!child) {
				console.warn("missing block for", parent.nodeName, '>', node.nodeName, id);
				parent.replaceChild(node.ownerDocument.createTextNode('·'), node);
				return;
			}
			var frag = this.renderFrom(child, blocks, store, Object.assign({}, opts, {type: type}));
			if (!frag) {
				parent.removeChild(node);
				return;
			}
			if (frag.attributes) {
				for (var i=0, att; i < node.attributes.length, att = node.attributes[i]; i++) {
					if (opts.strip && att.name == "block-id") continue;
					if (!frag.hasAttribute(att.name)) frag.setAttribute(att.name, att.value);
				}
			}
			parent.replaceChild(frag, node);
		}, this);
	}, this);
	return fragment;
};

