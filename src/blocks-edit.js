module.exports = Blocks;

function Blocks() {}

Blocks.prototype.create = function(type) {
	var el = this.view.element(type);
	var block = {
		type: type,
		data: Blocks.fill(el, {}),
		content: {}
	};
	if (el.standalone) block.standalone = true;
	return block;
};

Blocks.fill = function(schema, data) {
	if (!schema.properties) return data;
	// sometimes data can carry an old odd value
	if (data === undefined || typeof data == "string") data = {};
	Object.keys(schema.properties).forEach(function(key) {
		var prop = schema.properties[key];
		if (prop.default !== undefined && data[key] === undefined) data[key] = prop.default;
		if (prop.properties) data[key] = Blocks.fill(prop, data[key]);
	});
	return data;
};

Blocks.prototype.fromAttrs = function(attrs) {
	var block = {};
	for (var name in attrs) {
		if (!name.startsWith("_") && name != "content") {
			block[name] = attrs[name];
		}
	}
	if (block.data) block.data = JSON.parse(block.data);
	else block.data = {};

	var el = this.view.element(block.type);
	var data = Blocks.fill(el, block.data);
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
	if (block.focused) attrs.focused = block.focused;
	if (block.standalone) attrs.standalone = "true";
	if (attrs.data == "{}") delete attrs.data;
	return attrs;
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

Blocks.prototype.serializeTo = function(parent, el, ancestor) {
	if (!el || typeof el == "string") el = this.view.element(el || parent.type);
	if (ancestor) ancestor.blocks[parent.id] = parent;
	if ((el.standalone || parent.standalone) && !parent.virtual) {
		ancestor = parent;
	}

	if (parent == ancestor) {
		parent.blocks = {};
	}

	var contentKeys = (!el.contents || typeof el.contents == "string")
		? null : Object.keys(el.contents);

	if (!contentKeys) {
		// nothing to serialize here
	} else contentKeys.forEach(function(name) {
		var content = parent.content && parent.content[name];
		if (!content || typeof content == "string") {
			return;
		}
		if (parent.standalone && Array.isArray(content)) {
			// this is set by nodeView.update
			content = content[0];
		}
		content = content.cloneNode(true);
		var node, div, id, type, block, parentNode;
		if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			var frag = content.ownerDocument.createElement('div');
			frag.appendChild(content);
			content = frag;
		}
		var list = [], blockEl;
		while (node = content.querySelector('[block-id]')) {
			id = node.getAttribute('block-id');
			type = node.getAttribute('block-type');
			block = this.store[id];
			if (!block) {
				node.parentNode.removeChild(node);
				console.warn("block", type, "not found", id, "while serializing");
				continue;
			}
			blockEl = this.view.element(type || block.type);
			if (blockEl.unmount) {
				block = blockEl.unmount(block, node, this.view) || block;
			}
			div = content.ownerDocument.createElement(node.nodeName);
			parentNode = node.parentNode;
			parentNode.replaceChild(div, node);
			block = this.copy(block);
			reassignContent(block, blockEl, node);

			if (this.serializeTo(block, blockEl, ancestor)) {
				if (el.contents[name].virtual) {
					block.virtual = true;
				}
				if (type && type == block.type) type = null;
				list.push({node: div, block: block, type: type});
			} else {
				parentNode.removeChild(div);
				delete ancestor.blocks[block.id];
			}
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

	if (parent.content && contentKeys) {
		Object.keys(parent.content).forEach(function(name) {
			if (!el.contents[name] || el.contents[name].virtual) {
				delete parent.content[name];
			}
		});
		if (Object.keys(parent.content).length == 0) {
			delete parent.content;
		}
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
			// TODO find the meaning of this
			return;
		}
	}
	if (parent == ancestor) {
		parent.children = Object.keys(parent.blocks).map(function(kid) {
			return parent.blocks[kid];
		});
		delete parent.blocks;
	}
	return parent;
}

function reassignContent(block, elt, dom) {
	if (elt.contents == null || typeof elt.contents == "string") return;
	var rootContentName = dom.getAttribute('block-content');
	var content = block.content;
	if (!content) {
		if (!block.standalone) {
			console.warn("block without content", block, dom);
		}
		return;
	}
	var once = !rootContentName && elt.inline;
	var times = 0;
	Object.keys(elt.contents).forEach(function(name) {
		if (rootContentName == name || once) {
			times++;
			if (once && times > 1) {
				console.error("inline content found too many times", times, name, elt, block, dom);
			} else {
				block.content[name] = dom;
			}
		} else {
			var node = dom.querySelector(`[block-content="${name}"]`);
			if (node && node.closest('[block-id]') == dom) {
				content[name] = node;
			} else if (content[name]) {
				console.error("block has content but it was not found", name, elt, block, dom);
			}
		}
	});
}

Blocks.prototype.to = function() {
	var domFragment = this.view.utils.getDom();

	var id = this.view.dom.getAttribute('block-id');
	var type = this.view.dom.getAttribute('block-type');
	var contentName = this.view.dom.getAttribute('block-content') || 'fragment';

	var block = this.copy(this.store[id]);
	if (!block.content) block.content = {};
	block.content[contentName] = domFragment;
	return this.serializeTo(block, type);
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

