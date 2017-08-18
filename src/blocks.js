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

Blocks.prototype.render = function(block, overrideType) {
	var type = overrideType || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown block.type ${type}`);
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

Blocks.prototype.merge = function(dom, block, overrideType) {
	if (dom.nodeType != Node.ELEMENT_NODE) return;
	var el = this.view.element(overrideType || block.type);
	var contents = block.content;
	if (!contents) return;
	if (!el.contents) return;
	if (typeof el.contents != "string") Object.keys(el.contents).forEach(function(name) {
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

Blocks.prototype.from = function(blocks, overrideType) {
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
	if (blocks.type === undefined) {
		if (blocks != store) {
			store = this.store = Object.assign({}, blocks); // copy blocks
		}
		// it's a map of blocks, we need to find the root block
		var id = view.dom.getAttribute('block-id');
		if (!id) {
			id = this.genId();
			view.dom.setAttribute('block-id', id);
		}
		var contentName = view.dom.getAttribute('block-content') || 'fragment';
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
		if (!overrideType) {
			// mount() might change block.type, this ensures block will be rendered correctly
			overrideType = block.type;
		}
		if (block.id === undefined) {
			block.id = this.genId();
			store[block.id] = block;
		}
		if (block.children) {
			block.children.forEach(function(child) {
				store[child.id] = child;
			});
			// children can be consumed once only
			delete block.children;
		}
	}

	return p.then(function() {
		return self.mount(block);
	}).then(function(block) {
		if (block.id) store[block.id] = block;
		var fragment;
		try {
			fragment = view.render(block, overrideType);
		} catch(ex) {
			console.error(ex);
			return;
		}
		self.merge(fragment, block, overrideType);
		return Promise.all(Array.from(fragment.querySelectorAll('[block-id]')).map(function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var child = store[id];
			if (!child) {
				console.warn("ignoring unknown block id", id);
				return;
			}
			var type = node.getAttribute('block-type');
			return self.from(child, type).then(function(child) {
				if (child) node.parentNode.replaceChild(child, node);
			});
		}, this)).then(function() {
			return fragment;
		});
	});
};

Blocks.prototype.serializeTo = function(parent, blocks) {
	var el = this.view.element(parent.type);

	if (el.contents) Object.keys(el.contents).forEach(function(name) {
		var content = parent.content[name];
		if (!content) return;
		if (typeof content == "string") {
			console.warn("content not mounted, nothing to serialize", name, parent);
			return;
		}
		content = content.cloneNode(true);
		var node, div, id, type, block;
		if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			var frag = content.ownerDocument.createElement('div');
			frag.appendChild(content);
			content = frag;
		}
		var list = [];
		while (node = content.querySelector('[block-id]')) {
			id = node.getAttribute('block-id');
			type = node.getAttribute('block-type');
			block = this.store[id];
			if (!block) {
				node.parentNode.removeChild(node);
				console.warn("block not found", id, "while serializing");
				continue;
			}
			div = content.ownerDocument.createElement(node.nodeName);
			node.parentNode.replaceChild(div, node);
			block = this.copy(block);
			if (type) {
				if (type != block.type) block.type = type;
				else type = null;
			}
			this.serializeTo(block, blocks);
			list.push({node: div, block: block, type: type});
		}
		while (node = content.querySelector('[block-focused]')) {
			node.removeAttribute('block-focused');
		}
		list.forEach(function(item) {
			item.node.setAttribute('block-id', item.block.id);
			if (item.type) {
				// overrides block.type
				item.node.setAttribute('block-type', item.type);
			}
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
	var sel;
	if (id) {
		sel = `[block-id="${id}"]`;
	} else {
		sel = '';
	}
	if (opts.focused) {
		if (typeof opts.focused == "string") {
			sel += `[block-focused="${opts.focused}"]`;
		} else {
			sel += '[block-focused]';
		}
	} else if (!id) {
		throw new Error("domQuery expects at least id or opts.focused to be set", id, opts);
	}
	var nodes = Array.from(rootDom.querySelectorAll(sel));
	if (opts.all) return nodes;
	if (rootDom.getAttribute('block-id') == id) {
		// root is always focused, but another node having actual focus and representing
		// the current page could take precedence
		nodes.push(rootDom);
	}
	if (nodes.length == 0) return;
	var node = nodes[0];

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

