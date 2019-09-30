module.exports = Blocks;

function Blocks() {}

Blocks.prototype.mutate = function(node, data) {
	var nodes = [], block, id;
	if (typeof node != "string") {
		id = node.getAttribute('block-id');
	} else {
		id = node;
	}
	if (id) {
		block = this.get(id);
		if (!block) throw new Error("mutate node but block not found: " + id);
	}
	if (!id) {
		block = {
			type: node.getAttribute('block-type'),
			data: data
		};
		nodes = [node];
	} else {
		block.data = Object.assign(block.data || {}, data);
		nodes = this.domQuery(id, {all: true});
	}
	var view = this.view;
	var tr = view.state.tr;
	nodes.forEach(function(node) {
		view.utils.refreshTr(tr, node, block);
	});
	view.dispatch(tr);
};

Blocks.prototype.create = function(type) {
	return this.view.element(type).create();
};

Blocks.prototype.fromAttrs = function(attrs) {
	var block = {};
	for (var name in attrs) {
		if (!name.startsWith("_") && name != "content") {
			block[name] = attrs[name];
		}
	}
	if (block.data) block.data = JSON.parse(block.data);
	if (block.expr) block.expr = JSON.parse(block.expr);
	if (block.lock) block.lock = JSON.parse(block.lock);

	if (attrs.standalone == "true") block.standalone = true;
	else delete block.standalone;
	return block;
};

Blocks.prototype.toAttrs = function(block) {
	var attrs = {};
	if (!block) return attrs;
	if (block.id != null) attrs.id = block.id;
	if (block.type != null) attrs.type = block.type;
	if (block.data) attrs.data = JSON.stringify(block.data);
	if (block.expr) attrs.expr = JSON.stringify(block.expr);
	if (block.lock) attrs.lock = JSON.stringify(block.lock);
	if (block.focused) attrs.focused = block.focused;
	if (block.standalone) attrs.standalone = "true";
	return attrs;
};

Blocks.prototype.serializeTo = function(parent, el, ancestor) {
	if (!el || typeof el == "string") el = this.view.element(el || parent.type);
	if (ancestor && parent.id) ancestor.blocks[parent.id] = parent;
	if ((el.standalone || parent.standalone) && !parent.virtual) {
		ancestor = parent;
	}

	if (parent == ancestor) {
		parent.blocks = {};
	}

	var contents = parent.content;
	parent.content = {};

	el.contents.each({content: contents}, (content, def) => {
		if (!content || typeof content == "string") {
			return;
		}
		if (parent.standalone && Array.isArray(content)) {
			// this is set by nodeView.update
			content = content[0];
		}
		content = content.cloneNode(true);
		var node, div, id, type, block, parentNode;
		var list = [], blockEl;
		while ((node = content.querySelector('[block-type]'))) {
			type = node.getAttribute('block-type');
			parentNode = node.parentNode;
			blockEl = this.view.element(type);
			id = node.getAttribute('block-id');
			if (id) {
				block = this.store[id];
				if (!block) {
					parentNode.removeChild(node);
					console.warn("block", type, "not found", id, "while serializing");
					continue;
				}
				block = this.copy(block);
				if (blockEl.unmount) {
					blockEl.unmount(block, node, this.view);
				}
				div = content.ownerDocument.createElement(node.nodeName);
				parentNode.replaceChild(div, node);
				reassignContent(block, blockEl, node);
			} else {
				block = {type: type};
				div = node;
				div.removeAttribute('block-type');
				div.removeAttribute('block-focused');
			}

			if (!id || this.serializeTo(block, blockEl, ancestor)) {
				if (def.virtual) {
					block.virtual = true;
				}
				if (id && type == block.type) type = null;
				list.push({node: div, id: id, type: type});
			} else {
				parentNode.removeChild(div);
				if (id) delete ancestor.blocks[id];
			}
		}
		list.forEach(function(item) {
			if (item.id) item.node.setAttribute('block-id', item.id);
			if (item.type) {
				// can override block.type
				item.node.setAttribute('block-type', item.type);
			}
		});
		if (!def.virtual) el.contents.set(parent, def.id, this.view.utils.serializeHTML(content, true));
	});
	if (Object.keys(parent.content).length == 0) delete parent.content;

	if (el.inline && !el.leaf) {
		if (!el.contents.get(parent)) return; // TODO find the meaning of this
	}
	if (parent == ancestor) {
		parent.children = Object.keys(parent.blocks).map(function(kid) {
			return parent.blocks[kid];
		});
		delete parent.blocks;
	}
	return parent;
};

function reassignContent(block, elt, dom) {
	if (!block.content && !elt.leaf) {
		if (!block.standalone) {
			console.warn("block without content", block, dom);
		}
	} else elt.contents.each(block, function(content, def) {
		if (!def.id || def.id == dom.getAttribute('block-content') || elt.inline) {
			elt.contents.set(block, def.id, dom);
		} else {
			var node = dom.querySelector(`[block-content="${def.id}"]`);
			if (node && node.closest('[block-id]') == dom) {
				elt.contents.set(block, def.id, node);
			} else {
				console.error(`block.content[${def.id}] not found`, block, dom);
			}
		}
	});
}

Blocks.prototype.to = function() {
	var view = this.view;
	var id = view.dom.getAttribute('block-id');
	var contentName = view.dom.getAttribute("block-content");
	var copy = this.copy(this.store[id]);
	var el = view.element(copy.type);
	if (contentName) el.contents.set(copy, contentName, view.utils.getDom());
	return this.serializeTo(copy, view.dom.getAttribute('block-type'));
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
	if (typeof id != "string" && id.getAttribute) {
		id = id.getAttribute('block-id');
		if (!id) throw new Error("Node without block-id attribute");
	}
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

Blocks.prototype.genId = function(len) {
	if (!len) len = 8;
	// weak and simple unique id generator
	return (Date.now() * Math.round(Math.random() * 1e4) + '').substring(0, len);
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

