module.exports = Blocks;

function Blocks(view, genId) {
	this.view = view;
	this.store = {};
	this.initial = {};
	if (genId) this.genId = genId;
}

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

Blocks.prototype.render = function(block, opts) {
	if (!opts) opts = {};
	var type = opts.type || block.type;
	var el = this.view.element(type);
	if (!el) throw new Error(`Unknown block.type ${type}`);
	var dom = el.render(this.view.doc, block, this.view);
	if (dom && opts.merge !== false) this.merge(dom, block, type);
	return dom;
};

Blocks.prototype.mount = function(block, blocks) {
	var contents = block.content;
	var copy = this.copy(block);
	var content, div, frag, view = this.view;
	if (contents) for (var name in contents) {
		content = contents[name];
		if (!(content instanceof Node)) {
			copy.content[name] = htmlToFrag(view.doc, content);
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

function htmlToFrag(doc, str) {
	var frag = doc.createDocumentFragment();
	var wtag = "div";
	var tag;
	var matchTag = /^\s*<\s*([^\s>]+)[\s>]/i.exec(str);
	if (matchTag && matchTag.length == 2) {
		tag = matchTag[1].toLowerCase();
		switch (tag) {
			case "th":
			case "td":
				str = `<tr>${str}</tr>`;
				wtag = "table";
				tag = "tr";
			break;
			case "tr":
				str = `<tbody>${str}</tbody>`;
				tag = "tbody";
				wtag = "table";
			break;
			case "tbody":
			case "thead":
			case "tfoot":
				tag = wtag = "table";
			break;
			default:
				tag = null;
			break;
		}
	}
	var wrapper = doc.createElement(wtag);
	wrapper.innerHTML = str;
	if (tag && tag != wtag) wrapper = wrapper.querySelector(tag);
	while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
	return frag;
}

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
		if (typeof content == "string") {
			content = node.ownerDocument.createTextNode(content);
		} else if (content.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
			content = node.ownerDocument.importNode(content, true);
		} else {
			console.warn("cannot merge content", content);
			return;
		}
		if (node.childNodes.length == 1 && node.firstChild.nodeType == Node.TEXT_NODE) {
			node.textContent = "";
		}
		node.appendChild(content);
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
	if (!blocks) blocks = this.initial = {};
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
	return Promise.resolve().then(function() {
		return self.mount(block, blocks);
	}).then(function(block) {
		if (block.children) {
			block.children.forEach(function(child) {
				blocks[child.id] = child;
			});
			// children can be consumed once only
			delete block.children;
		}
		if (block.id && !store[block.id]) {
			// overwrite can happen with virtual blocks
			store[block.id] = block;
		}
		var fragment;
		try {
			fragment = view.render(block, {
				type: overrideType
			});
		} catch(ex) {
			console.error(ex);
			return;
		}
		if (!fragment) return;
		return Promise.all(Array.from(fragment.querySelectorAll('[block-id]')).map(function(node) {
			var id = node.getAttribute('block-id');
			if (id === block.id) return;
			var type = node.getAttribute('block-type');
			var child = blocks[id];
			if (!child) {
				console.warn("Block not found", id);
				if (type) {
					console.warn("Replacing it with a new block", type);
					child = self.create(type);
					child.id = self.genId();
				} else {
					// TODO find a gentler way that doesn't NUKE all page
					console.error("removing block without type", node.outerHTML);
					node.remove();
					return;
				}
			}
			return self.parseFrom(child, blocks, store, type).then(function(child) {
				if (child) node.parentNode.replaceChild(child, node);
			});
		}, this)).then(function() {
			return fragment;
		});
	});
};

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

