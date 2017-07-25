var Block = require('./block');

module.exports = Store;

function Store(editor) {
	this.blocks = {};
	this.editor = editor;
	editor.elements.push(Store.element);

	var me = this;

	editor.plugins.push({
		props: {
			transformPasted: function(pslice) {
				pslice.content.descendants(function(node) {
					node = me.pasteNode(node);
				});
				return pslice;
			}
		}
	});
}

Store.element = {
	name: 'id',
	view: function(doc, block) {
		return doc.createElement("div");
	}
};
/*
function mutateNodes(fragment, fn) {
	var len = fragment.childCount;
	var child, childFragment;
	for (var i=0; i < len; i++) {
		child = fragment.child(i);
		childFragment = mutateNodes(child.content, fn);
		var attrs = fn(child);
		if (attrs) {
			child = child.copy(childFragment);
			child.attrs = attrs;
			fragment = fragment.replaceChild(i, child);
		}
	}
	return fragment;
}
*/

function getIdBlockNode(node) {
	var id = node.attrs.block_id;
	if (id == null && node.marks.length > 0) {
		node = node.marks[0];
		id = node.attrs.block_id;
	}
	return {id: id, node: node};
}

Store.prototype.pasteNode = function(node) {
	var bn = getIdBlockNode(node);
	if (bn.id == null) {
		// a block node must have an id, so it is not one
		return;
	}
	var block = this.get(bn.id);
	if (!block) {
		// unknown block, let id module deserialize it later
		bn.node.attrs.block_id = this.genId();
		return;
	}
	var dom = this.editor.dom.querySelector(`[block-id="${bn.id}"]`);
	if (dom) {
		// known block already exists, assume copy/paste
		block = this.editor.copy(block);
		block.content = this.editor.parseContent(block.content);
		block.id = bn.node.attrs.block_id = this.genId();
		this.editor.modules.id.set(block);
	} else {
		// known block is not in dom, assume cut/paste or drag/drop
	}
};


Store.prototype.from = function(block, blocks) {
	if (!blocks) blocks = this.blocks = {};
	if (this.blocks != blocks) this.blocks = blocks;
	var childBlock;
	if (block.children) {
		for (var i=0; i < block.children.length; i++) {
			childBlock = block.children[i];
			blocks[childBlock.id] = childBlock;
		}
	}
	if (!block) block = "";
	if (typeof block == "string") block = new Block({
		type: 'fragment',
		content: {
			fragment: block
		}
	});
	if (block.id) blocks[block.id] = block;

	var el = this.editor.element(block.type);
	if (el && el.from) {
		block = block.copy();
		el.from(block, this);
	}

	var fragment;
	try {
		fragment = this.editor.render(block);
	} catch(ex) {
		console.error(ex);
		return;
	}
	var nodes = Array.prototype.slice.call(fragment.querySelectorAll('[block-id]'));

	var id, node, child;
	for (var i=0; i < nodes.length; i++) {
		node = nodes[i];
		id = node.getAttribute('block-id');
		if (id === '' + block.id) {
			continue;
		}
		childBlock = blocks[id];
		if (!childBlock) {
			console.warn("ignoring unknown block id", id);
			continue;
		}
		el = this.editor.element(childBlock.type);
		child = this.from(childBlock, blocks);
		if (!child) continue;
		node.parentNode.replaceChild(child, node);
		if (el && el.inline) {
			while (child.firstChild) child.removeChild(child.firstChild);
			while (node.firstChild) child.appendChild(node.firstChild);
		}
	}
	return fragment;
};

Store.prototype.to = function(blocks) {
	var list = [];
	var editor = this.editor;
	var origModifiers = editor.modifiers;

	editor.modifiers = origModifiers.concat([function(editor, block, dom) {
		console.log("id.to modifier", block.id);
		if (block.id) {
			var ndom = dom.ownerDocument.createElement(dom.nodeName);
			ndom.setAttribute('block-id', block.id);
			ndom.setAttribute('block-type', block.type);
			// make sure we don't accidentally store focused state
			ndom.removeAttribute('block-focused');
			list.push(block);
			return ndom;
		}
	}]);

	var domFragment = editor.get();

	editor.modifiers = origModifiers;

	var div = domFragment.ownerDocument.createElement("div");
	div.appendChild(domFragment);

	var block = null;
	// this is when the editor document is a block itself
	var id = editor.dom.getAttribute('block-id');
	if (id) {
		block = this.blocks[id];
		block = editor.copy(this.blocks[id]);
		block.content = {};
		block.content[editor.dom.getAttribute('block-content')] = div.innerHTML;
		if (blocks) blocks[block.id] = block;
	} else {
		block = {
			type: 'fragment',
			content: {
				fragment: div.innerHTML
			}
		}
	}
	// the order is important here - not an optimization
	var item, el, dom;
	block.children = [];
	for (var i = list.length - 1; i >= 0; i--) {
		item = editor.copy(list[i]);
		el = editor.element(item.type);
		if (el && el.to) {
			// TODO make sure we can't do something cleaner
			el.to(item, this);
		}
		item.content = editor.serializeContent(item.content);
		if (!item.orphan) block.children.push(item);
		if (blocks) blocks[item.id] = item;
	}
	return block;
};

Store.prototype.clear = function(id) {
	if (id === undefined) {
		this.blocks = {};
	} else if (id == null || id == false) {
		console.warn('id.clear expects undefined or something not null');
	} else if (!this.blocks[id]) {
		console.warn('id.clear expects blocks to contain id', id);
	} else {
		delete this.blocks[id];
	}
};

Store.prototype.get = function(id) {
	if (id == null) return;
	return this.blocks[id];
};

Store.prototype.set = function(data) {
	if (!Array.isArray(data)) data = [data];
	for (var i = 0, cur; i < data.length; i++) {
		cur = data[i];
		if (cur.id == null) {
			cur.id = this.genId();
		}
		this.blocks[cur.id] = cur;
	}
};

Store.prototype.genId = function() {
	// weak and simple unique id generator
	return Date.now() + Math.round(Math.random() * 1e4);
};

Store.prototype.domQuery = function(id, opts) {
	if (!opts) opts = {};
	var doc = this.editor.dom;
	var nodes, node;
	if (doc.getAttribute('block-id') == id) {
		// always focused
		node = doc;
	} else {
		var sel = `[block-id="${id}"]`;
		if (opts.focused) sel += '[block-focused]';
		nodes = doc.querySelectorAll(sel);
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

Store.prototype.domSelect = function(node) {
	var editor = this.editor;
	editor.focus();
	editor.selectDom(node);
};

function IdModifier(editor, block, dom) {
	if (!block.id) {
		editor.modules.id.set(block);
	}
	dom.setAttribute('block-id', block.id);
}

