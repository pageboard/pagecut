module.exports = Blocks;

function Blocks(view, genId) {
	this.view = view;
	this.store = {};
	if (genId) this.genId = genId;
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

Blocks.prototype.fromAttrs = function(attrs) {
	var block = {};
	for (var name in attrs) {
		if (name.startsWith('block_')) block[name.substring(6)] = attrs[name];
	}
	if (block.data) block.data = JSON.parse(block.data);
	else block.data = {};

	var el = this.view.element(block.type);
	var data = block.data;
	for (var k in el.properties) {
		if (el.properties[k].default !== undefined && data[k] === undefined) {
			data[k] = el.properties[k].default;
		}
	}
	return block;
};

Blocks.prototype.toAttrs = function(block) {
	var attrs = {};
	if (!block) return attrs;
	if (block.id != null) attrs.block_id = block.id;
	if (block.type != null) attrs.block_type = block.type;
	if (block.data) attrs.block_data = JSON.stringify(block.data);
	if (block.focused) attrs.block_focused = block.focused;
	if (attrs.block_data == "{}") delete attrs.block_data;
	return attrs;
};

Blocks.prototype.render = function(block, overrideType) {
	var type = overrideType || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown block.type ${type}`);
	return el.render(this.view.doc, block, this.view);
};

Blocks.prototype.mount = function(block, blocks) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, div, frag, view = this.view;
	if (contents) for (var name in contents) {
		content = contents[name];
		if (!(content instanceof Node)) {
			div = view.doc.createElement("div");
			div.innerHTML = content;
			frag = view.doc.createDocumentFragment();
			while (div.firstChild) frag.appendChild(div.firstChild);
			copy.content[name] = frag;
		}
	}
	var el = view.element(copy.type);
	if (!el) {
		console.error("Cannot find element for block", block);
		return copy;
	}
	return Promise.resolve().then(function() {
		if (el.mount) return el.mount(copy, blocks, view);
	}).then(function() {
		return copy;
	});
};

function nodeToHtml(node) {
	var html;
	if (node instanceof Node) {
		html = "";
		var child;
		while (child = node.querySelector('br:not([contenteditable])')) {
			child.remove();
		}
		for (var i=0; i < node.childNodes.length; i++) {
			child = node.childNodes[i];
			if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
			else if (!child.hasAttribute('block-virtual')) html += child.outerHTML;
		}
	} else {
		html = node;
	}
	return html;
}

Blocks.prototype.copy = function(block) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
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
	if (typeof el.contents != "string") Object.keys(el.contents).forEach(function(name) {
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
		var content = contents[name];
		if (!content) return;
		if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			node.appendChild(node.ownerDocument.importNode(content, true));
		} else {
			console.warn("cannot merge content", content);
		}
	});
	else if (Object.keys(block.content).length) {
		console.warn("Cannot mount block", block);
	}
};

Blocks.prototype.from = function(block, blocks) {
	// blocks can be a block or a map of blocks
	// if it's a block, it can have a 'children' property
	var self = this;
	var view = this.view;
	var store = {};

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
	// it's a map of blocks, we need to find the root block
	if (!block) {
		var id = view.dom.getAttribute('block-id');
		if (!id) {
			// can't rely on id plugin until view.dom changes are applied by a Step instance
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
	}
	return this.parseFrom(block, blocks, store).then(function(result) {
		self.store = store;
		return result;
	});
};

Blocks.prototype.parseFrom = function(block, blocks, store, overrideType) {
	var view = this.view;
	var self = this;
	if (!store) store = this.store;
	if (!blocks) blocks = {};

	if (!overrideType) {
		// mount() might change block.type, this ensures block will be rendered correctly
		overrideType = block.type;
	}
	if (block.children) {
		block.children.forEach(function(child) {
			blocks[child.id] = child;
		});
		// children can be consumed once only
		delete block.children;
	}
	return Promise.resolve().then(function() {
		return self.mount(block, blocks);
	}).then(function(block) {
		if (block.id) {
			store[block.id] = block;
		}
		var fragment;
		try {
			fragment = view.render(block, overrideType);
		} catch(ex) {
			console.error(ex);
			return;
		}
		if (!fragment) return;
		self.merge(fragment, block, overrideType);
		return Promise.all(Array.from(fragment.querySelectorAll('[block-id]')).map(function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var child = blocks[id];
			if (!child) {
				node.remove();
				console.warn("DOM node removed because it has unknown block id", node.outerHTML);
				return;
			}
			var type = node.getAttribute('block-type');
			return self.parseFrom(child, blocks, store, type).then(function(child) {
				if (child) node.parentNode.replaceChild(child, node);
			});
		}, this)).then(function() {
			return fragment;
		});
	});
};

Blocks.prototype.serializeTo = function(parent, blocks, overrideType) {
	var el = this.view.element(overrideType || parent.type);

	var contentKeys = (!el.contents || typeof el.contents == "string")
		? null : Object.keys(el.contents);

	if (!contentKeys) {
		// nothing to serialize here
	} else contentKeys.forEach(function(name) {
		var content = parent.content && parent.content[name];
		if (!content || typeof content == "string") {
			return;
		}
		content = content.cloneNode(true);
		var node, div, id, type, block, parentNode;
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
				console.warn("block", type, "not found", id, "while serializing");
				continue;
			}
			div = content.ownerDocument.createElement(node.nodeName);
			parentNode = node.parentNode;
			parentNode.replaceChild(div, node);
			block = this.copy(block);

			if (this.serializeTo(block, blocks, type)) {
				if (type && type == block.type) type = null;
				list.push({node: div, block: block, type: type});
			} else {
				parentNode.removeChild(div);
			}
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

	if (el.unmount) {
		parent = el.unmount(parent, blocks, this.view) || parent;
	}

	if (parent.content && contentKeys) {
		Object.keys(parent.content).forEach(function(name) {
			if (!el.contents[name] || el.contents[name].virtual) delete parent.content[name];
		});
		if (Object.keys(parent.content).length == 0) delete parent.content;
	}

	if (el.inline && contentKeys && contentKeys.length) {
		var hasContent = false;
		if (parent.content) for (var name in parent.content) {
			if (parent.content[name]) {
				hasContent = true;
				break;
			}
		}
		if (!hasContent) {
			if (parent.id) delete blocks[parent.id];
			return;
		}
	}

	if (parent.id) blocks[parent.id] = parent;

	return parent;
}

Blocks.prototype.to = function(blocks) {
	if (!blocks) blocks = {};
	var domFragment = this.view.utils.getDom();

	var id = this.view.dom.getAttribute('block-id');
	var type = this.view.dom.getAttribute('block-type');
	var contentName = this.view.dom.getAttribute('block-content') || 'fragment';

	var block = this.copy(this.store[id]);
	if (!block.content) block.content = {};
	block.content[contentName] = domFragment;
	// because serializeTo can return null if there was no content
	block = this.serializeTo(block, blocks, type) || block;

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
	return data;
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
		throw new Error("domQuery expects at least id or opts.focused to be set " + id);
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

