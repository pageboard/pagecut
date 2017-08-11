module.exports = Blocks;

function Blocks(view) {
	this.view = view;
	this.store = {};
}

Blocks.prototype.create = function(type) {
	var el = this.view.element(type);
	var data = {};
	for (var k in el.properties) {
		if (el.properties[k].default !== undefined) data[k] = el.properties[k].default;
	}
	return {
		type: type,
		data: data,
		content: {}
	};
};

Blocks.prototype.render = function(block) {
	var el = this.view.element(block.type);
	if (!el) throw new Error(`Unknown block.type ${block.type}`);
	return el.render(this.view.doc, block, this.view);
};

Blocks.prototype.mount = function(block) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, div, frag, view = this.view;
	for (var name in contents) {
		content = contents[name];
		if (content instanceof Node) {
			frag = content;
		} else {
			div = view.doc.createElement("div");
			div.innerHTML = content;
			frag = view.doc.createDocumentFragment();
			while (div.firstChild) frag.appendChild(div.firstChild);
		}
		copy.content[name] = frag;
	}
	var el = view.element(copy.type);
	return Promise.resolve().then(function() {
		if (el.mount) return el.mount(copy, view);
	}).then(function() {
		return copy;
	});
};

Blocks.prototype.unmount = function(block) {
	var contents = block.content;
	var copy = this.copy(block);
	for (var name in contents) {
		copy.content[name] = nodeToHtml(contents[name]);
	}
	return copy;
};

function nodeToHtml(node) {
	var html;
	if (node instanceof Node) {
		html = "";
		var child;
		for (var i=0; i < node.childNodes.length; i++) {
			child = node.childNodes[i];
			if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
			else html += child.outerHTML;
		}
	} else {
		html = node;
	}
	return html;
}

Blocks.prototype.copy = function(block) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	copy.content = Object.assign({}, block.content);
	delete copy.focused;
	delete copy.deleted;
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
	var p = Promise.resolve();
	var self = this;
	var view = this.view;

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
			store = this.store = blocks;
		}
		// it's a map of blocks, we need to find the root block
		var id = view.dom.getAttribute('block-id');
		var contentName = view.dom.getAttribute('block-content') || 'fragment';
		if (!id) {
			id = this.genId();
			view.dom.setAttribute('block-id', id);
		}
		var frag = "";
		block = blocks[id];
		if (!block) {
			block = {
				id: id,
				type: 'fragment',
				content: {}
			};
			block.content[contentName] = frag;
		}
	} else {
		// it's a block
		block = blocks;
		if (block.children) block.children.forEach(function(child) {
			store[child.id] = child;
		});
	}

	return p.then(function() {
		return self.mount(block);
	}).then(function(block) {
		store[block.id] = block;
		var fragment;
		try {
			fragment = view.render(block);
		} catch(ex) {
			console.error(ex);
			return;
		}
		self.merge(fragment, block);
		return Promise.all(Array.from(fragment.querySelectorAll('[block-id]')).map(function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var child = store[id];
			if (!child) {
				console.warn("ignoring unknown block id", id);
				return;
			}
			return self.from(child).then(function(child) {
				if (child) node.parentNode.replaceChild(child, node);
			});
		}, this)).then(function() {
			return fragment;
		});
	});
};

Blocks.prototype.serializeTo = function(parent, blocks) {
	parent = this.copy(parent);
	var el = this.view.element(parent.type);

	if (el.contents) Object.keys(el.contents).forEach(function(name) {
		var content = parent.content[name];
		if (!content) return;
		content = content.cloneNode(true);
		var node, div, id, type;
		if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			var frag = content.ownerDocument.createElement('div');
			frag.appendChild(content);
			content = frag;
		}
		var list = [];
		while (node = content.querySelector('[block-id]')) {
			id = node.getAttribute('block-id');
			div = content.ownerDocument.createElement(node.nodeName);
			node.parentNode.replaceChild(div, node);
			this.serializeTo(this.store[id], blocks);
			list.push({node: div, id: id});
		}
		list.forEach(function(item) {
			item.node.setAttribute('block-id', item.id);
		});
		parent.content[name] = nodeToHtml(content);
	}, this);

	blocks[parent.id] = parent;

	if (el.unmount) parent = el.unmount(parent, this) || parent;
	return parent;
}

Blocks.prototype.to = function(blocks) {
	if (!blocks) blocks = {};
	var domFragment = this.view.utils.getDom();

	var id = this.view.dom.getAttribute('block-id');
	var contentName = this.view.dom.getAttribute('block-content') || 'fragment';

	var block = this.copy(this.store[id]);
	block.content[contentName] = domFragment;
	block = this.serializeTo(block, blocks);

	var item;
	block.children = [];
	for (var childId in blocks) {
		if (childId === id) continue;
		item = blocks[childId];
		if (!item.orphan) block.children.push(item);
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

