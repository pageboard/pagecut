module.exports = IdModule;

function IdModule(editor) {
	this.blocks = {};
	this.editor = editor;
	if (editor.resolvers) editor.resolvers.push(IdResolver);
	editor.modifiers.push(IdModifier);
	editor.elements.push(IdModule.element);

	var me = this;

	editor.plugins.push({
		props: {
			transformPasted: function(pslice) {
				pslice.content.descendants(function(node) {
					node = me.pasteNode(node);
				});
				return pslice;


			},
			/*
			clipboardSerializer: {
				serializeFragment: function(frag, opts) {
					frag.descendants(function(node) {
						// do something
					});
					return editor.serializers.edit.serializeFragment(frag, opts);
				}
			}
			*/
		}
	});
}

IdModule.element = {
	name: 'id',
	view: function(doc, block) {
		return doc.createElement("div");
	}
};

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


function getIdBlockNode(node) {
	var id = node.attrs.block_id;
	if (id == null && node.marks.length > 0) {
		node = node.marks[0];
		id = node.attrs.block_id;
	}
	return {id: id, node: node};
}

IdModule.prototype.pasteNode = function(node) {
	var bn = getIdBlockNode(node);
	if (bn.id == null) {
		// a block node must have an id, so it is not one
		return;
	}
	var block = this.get(bn.id);
	if (!block) {
		// unknown block, let id module deserialize it later
		bn.node.attrs.block_id = this.genId();
		bn.node.attrs.block_status = "new";
		return;
	}
	var dom = this.editor.dom.querySelector('[block-id="'+bn.id+'"]');
	if (dom) {
		// known block already exists, assume copy/paste
		block = this.editor.copy(block, true);
		block.id = bn.node.attrs.block_id = this.genId();
		block.status = bn.node.attrs.block_status = "new";
		this.editor.modules.id.set(block);
	} else {
		// known block is not in dom, assume cut/paste or drag/drop
	}
};


IdModule.prototype.from = function(rootBlock, blocks) {
	if (blocks) this.blocks = blocks;
	else blocks = this.blocks;
	if (!rootBlock) rootBlock = "";
	if (typeof rootBlock == "string") rootBlock = {
		type: 'fragment',
		content: {
			fragment: rootBlock
		}
	};
	if (blocks) {
		this.blocks = blocks;
		if (rootBlock.id) this.blocks[rootBlock.id] = rootBlock;
	} else {
		blocks = this.blocks;
	}
	var fragment = this.editor.render(rootBlock);
	var nodes = Array.prototype.slice.call(fragment.querySelectorAll('[block-id]'));

	var block, id, node, child;
	for (var i=0; i < nodes.length; i++) {
		node = nodes[i];
		id = node.getAttribute('block-id');
		if (id === '' + rootBlock.id) {
			continue;
		}
		block = blocks[id];
		if (!block) {
			console.warn("ignoring unknown block id", id);
			continue;
		}
		child = this.from(block);
		node.parentNode.replaceChild(child, node);
		if (child.childNodes.length == 0 && child.hasAttribute('block-content') == false) {
			while (node.firstChild) child.appendChild(node.firstChild);
		}
	}
	return fragment;
};

IdModule.prototype.to = function(blocks) {
	var list = [];
	var editor = this.editor;
	var origModifiers = editor.modifiers;
	editor.modifiers = origModifiers.concat([function(editor, block, dom) {
		if (block.id) {
			var ndom = dom.ownerDocument.createElement(editor.map[block.type].inline ? 'span' : 'div');
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

	// the order is important here - not an optimization
	for (var i = list.length - 1; i >= 0; i--) {
		blocks[list[i].id] = editor.copy(list[i], false);
	}

	var div = domFragment.ownerDocument.createElement("div");
	div.appendChild(domFragment);

	var rootBlock = null;
	var rootId = editor.dom.getAttribute('block-id');
	if (rootId) {
		rootBlock = this.blocks[rootId];
		rootBlock = editor.copy(rootBlock, false);
		rootBlock.content = {};
		rootBlock.content[editor.dom.getAttribute('block-content')] = div.innerHTML;
		blocks[rootBlock.id] = rootBlock;
	} else {
		rootBlock = {
			type: 'fragment',
			content: {
				fragment: div.innerHTML
			}
		}
	}
	return rootBlock;
};

IdModule.prototype.clear = function(id) {
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

IdModule.prototype.get = function(id) {
	return this.blocks[id];
};

IdModule.prototype.set = function(data) {
	if (!Array.isArray(data)) data = [data];
	for (var i = 0, cur; i < data.length; i++) {
		cur = data[i];
		if (cur.id == null) {
			cur.id = this.genId();
			cur.status = "new";
		}
		this.blocks[cur.id] = cur;
	}
};

IdModule.prototype.genId = function() {
	// weak and simple unique id generator
	return Date.now() + Math.round(Math.random() * 1e4);
};

IdModule.prototype.domQuery = function(id, opts) {
	var doc = this.editor.dom;
	var nodes, node;
	if (doc.getAttribute('block-id') == id) {
		// always focused
		node = doc;
	} else {
		var sel = `[block-id="${id}"]`;
		if (opts.focused) sel += '[block-focused]';
		nodes = doc.querySelectorAll(sel);
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

IdModule.prototype.domSelect = function(node) {
	var editor = this.editor;
	editor.focus();
	var doc = editor.root;
	var sel = doc.defaultView.getSelection();
	var range = doc.createRange();
	range.setStart(node, 0);
	range.setEnd(node, 0);
	sel.removeAllRanges();
	sel.addRange(range);
};

function IdResolver(editor, obj, cb) {
	var id = obj.node && obj.node.getAttribute('block-id');
	if (!id) return;
	var block = editor.modules.id.get(id);
	if (block) return block;
	if (IdResolver.fetch) IdResolver.fetch(id, function(err, block) {
		if (err) return cb(err);
		editor.modules.id.set(block);
		cb(null, block);
	});
	return {
		type: 'id',
		id: id
	};
}

function IdModifier(editor, block, dom) {
	if (!block.id) {
		editor.modules.id.set(block);
	}
	dom.setAttribute('block-id', block.id);
}

