module.exports = Blocks;

function Blocks(view) {
	this.view = view;
	this.store = {};
}

Blocks.prototype.render = function(block) {
	var el = this.view.element(block.type);
	if (!el) throw new Error(`Unknown block.type ${block.type}`);
	var dom = el.render(this.view.doc, block, this.view);
	if (dom.nodeType == Node.ELEMENT_NODE) {
		dom.setAttribute('block-type', block.type);
		if (block.id) dom.setAttribute('block-id', block.id);
		else dom.removeAttribute('block-id');
	}
	return dom;
};

Blocks.prototype.mount = function(block) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, div, frag;
	for (var name in contents) {
		content = contents[name];
		if (content instanceof Node) {
			frag = content;
		} else {
			div = this.view.doc.createElement("div");
			div.innerHTML = content;
			frag = this.view.doc.createDocumentFragment();
			while (div.firstChild) frag.appendChild(div.firstChild);
		}
		copy.content[name] = frag;
	}
	return copy;
};

Blocks.prototype.unmount = function(block) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, html, child;
	for (var name in contents) {
		content = contents[name];
		if (content instanceof Node) {
			html = "";
			for (var i=0; i < content.childNodes.length; i++) {
				child = content.childNodes[i];
				if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
				else html += child.outerHTML;
			}
		} else {
			html = content;
		}
		copy.content[name] = html;
	}
	return copy;
};

Blocks.prototype.copy = function(block) {
	var copy = {};
	if (block.id != null) copy.id = block.id;
	if (block.type != null) copy.type = block.type;
	copy.data = Object.assign({}, block.data);
	copy.content = Object.assign({}, block.content);
	return copy;
};

Blocks.prototype.merge = function(dom, block) {
	if (dom.nodeType != Node.ELEMENT_NODE) return;
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

Blocks.prototype.from = function(blocks) {
	// blocks can be a block or a map of blocks
	// if it's a block, it can have a 'children' property
	var frag = "";
	if (typeof blocks == "string") {
		frag = blocks
		blocks = null;
	}
	if (!blocks) blocks = {};
	var block;
	var store = this.store;
	if (blocks.id === undefined) {
		if (blocks != store) {
			store = this.store = {};
		}
		// it's a map of blocks, we need to find the root block
		var id = this.view.dom.getAttribute('block-id');
		if (!id) {
			id = this.genId();
			this.view.dom.setAttribute('block-id', id);
		}
		var frag = "";
		block = blocks[id];
		if (!block) {
			block = {
				type: 'fragment',
				content: { fragment: frag }
			};
		}
	} else {
		// it's a block
		block = blocks;
		if (block.children) block.children.forEach(function(child) {
			store[child.id] = this.mount(child);
		}, this);
	}

	block = store[block.id] = this.mount(block);

	var fragment;
	try {
		fragment = this.view.render(block);
	} catch(ex) {
		console.error(ex);
		return;
	}
	this.merge(fragment, block);
	Array.from(fragment.querySelectorAll('[block-id]')).forEach(function(node) {
		var id = node.getAttribute('block-id');
		if (id === block.id) return;
		var child = store[id];
		if (!child) {
			console.warn("ignoring unknown block id", id);
			return;
		}
		var el = this.view.element(child.type);
		child = this.from(child);
		if (!child) return;
		node.parentNode.replaceChild(child, node);
		if (el && el.inline) {
			while (child.firstChild) child.removeChild(child.firstChild);
			while (node.firstChild) child.appendChild(node.firstChild);
		}
	}, this);
	return fragment;
};

Blocks.prototype.to = function(blocks) {
	var list = [];
	var view = this.view;
//	var origModifiers = view.modifiers;

//	view.modifiers = origModifiers.concat([function(view, block, dom) {
//		console.log("id.to modifier", block.id);
//		if (block.id) {
//			var ndom = dom.ownerDocument.createElement(dom.nodeName);
//			ndom.setAttribute('block-id', block.id);
//			ndom.setAttribute('block-type', block.type);
//			// make sure we don't accidentally store focused state
//			ndom.removeAttribute('block-focused');
//			list.push(block);
//			return ndom;
//		}
//	}]);

	var domFragment = view.utils.getDom();

//	view.modifiers = origModifiers;

	var doc = domFragment.ownerDocument;
	var div = doc.createElement("div");
	div.appendChild(domFragment);

	for (var id in this.store) {
		var domBlock = div.querySelector(`[block-id="${id}"]`);
		if (domBlock) domBlock.parentNode.replaceChild(doc.dom`<div block-id="${id}"></div>`, domBlock);
	}

	var block = null;
	// this is when the view document is a block itself
	var id = view.dom.getAttribute('block-id');
	if (id) {
		block = this.store[id];
		// TODO this is very much an unmount() call
//		block.content = {};
//		block.content[view.dom.getAttribute('block-content')] = div.innerHTML;
		if (blocks) blocks[block.id] = view.unmount(this.store[id]);
	} else {
		block = {
			type: 'fragment',
			content: {
				fragment: div.innerHTML
			}
		}
	}
	// the order is important here - not an optimization
	var item;
	block.children = [];
	for (var i = list.length - 1; i >= 0; i--) {
		item = this.unmount(list[i]);
		if (!item.orphan) block.children.push(item);
		if (blocks) blocks[item.id] = item;
	}
	return block;
};


Blocks.prototype.clear = function(id) {
	if (id === undefined) {
		this.store = {};
	} else if (id == null || id == false) {
		console.warn('id.clear expects undefined or something not null');
	} else if (!this.store[id]) {
		console.warn('id.clear expects blocks to contain id', id);
	} else {
		delete this.store[id];
	}
};

Blocks.prototype.get = function(id) {
	if (id == null) return;
	return this.store[id];
};

Blocks.prototype.set = function(data) {
	if (!Array.isArray(data)) data = [data];
	for (var i = 0, cur; i < data.length; i++) {
		cur = data[i];
		if (cur.id == null) {
			cur.id = this.genId();
		}
		this.store[cur.id] = cur;
	}
};

Blocks.prototype.genId = function() {
	// weak and simple unique id generator
	return Date.now() + Math.round(Math.random() * 1e4) + '';
};

Blocks.prototype.domQuery = function(id, opts) {
	if (!opts) opts = {};
	var rootDom = this.view.dom;
	var nodes, node;
	if (rootDom.getAttribute('block-id') == id) {
		// always focused
		node = rootDom;
	} else {
		var sel = `[block-id="${id}"]`;
		if (opts.focused) sel += '[block-focused]';
		nodes = rootDom.querySelectorAll(sel);
		if (opts.all) return nodes;
		if (nodes.length > 1) throw new Error(`Multiple nodes with same id are focused ${id}`);
		if (!nodes.length) return;
		node = nodes[0];
	}
	if (opts.content) {
		if (node.getAttribute('block-content') == opts.content) {
			return node;
		} else {
			return node.querySelector(`[block-content="${opts.content}"]`);
		}
	} else {
		return node;
	}
};

Blocks.prototype.domSelect = function(node) {
	this.view.focus();
	this.view.utils.selectDom(node);
};

