module.exports = IdModule;

function IdModule(editor) {
	this.store = {};
	this.editor = editor;
	if (editor.resolvers) editor.resolvers.push(IdResolver);
	editor.modifiers.push(IdModifier);
	editor.elements.push(IdModule.element);

	var me = this;

	editor.plugins.push({
		props: {
			transformPasted: function(pslice) {
				pslice.content.descendants(function(node) {
					me.pasteNode(node);
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
	if (bn.id == null) return;
	var block = this.get(bn.id);
	if (!block) {
		bn.node.attrs.id = 'id' + Date.now();
		return;
	}
	var dom = this.editor.dom.querySelector('[block-id="'+bn.id+'"]');
	if (dom) {
		block = this.editor.copy(block, true);
		block.id = bn.node.attrs.id = 'id' + Date.now();
		this.editor.modules.id.set(block);
	}
	// else keep the id
};


IdModule.prototype.from = function(rootBlock, resolver) {
	if (!rootBlock) rootBlock = "";
	if (typeof rootBlock == "string") rootBlock = {
		type: 'fragment',
		content: {
			fragment: rootBlock
		}
	};
	var fragment = this.editor.render(rootBlock);
	var nodes = Array.prototype.slice.call(fragment.querySelectorAll('[block-id]'));
	var me = this;

	var list = [];

	var block, id, node;
	for (var i=0; i < nodes.length; i++) {
		node = nodes[i];
		id = node.getAttribute('block-id');
		if (id === '' + rootBlock.id) {
			continue;
		}
		block = this.store[id];
		var p;
		if (block) {
			p = Promise.resolve(block);
		} else if (resolver) {
			p = Promise.resolve().then(function() {
				return resolver(id, this.store);
			});
		} else {
			p = Promise.reject(new Error("Unknown block id " + id));
		}
		list.push(p.then(function(block) {
			var node = this;
			return me.from(block, resolver).then(function(child) {
				node.parentNode.replaceChild(child, node);
				if (child.childNodes.length == 0 && child.hasAttribute('block-content') == false) {
					while (node.firstChild) child.appendChild(node.firstChild);
				}
			});
		}.bind(node)));
	}

	return Promise.all(list).then(function() {
		return fragment;
	});
};

IdModule.prototype.to = function() {
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

	var block;
	for (var i = list.length - 1; i >= 0; i--) {
		block = list[i];
		this.store[block.id] = editor.copy(block, false);
	}

	var div = domFragment.ownerDocument.createElement("div");
	div.appendChild(domFragment);

	block = null;
	var rootId = editor.dom.getAttribute('block-id');
	if (rootId) {
		block = editor.copy(this.get(rootId), false);
		block.content = {};
		block.content[editor.dom.getAttribute('block-content')] = div.innerHTML;
	} else {
		block = {
			type: 'fragment',
			content: {
				fragment: div.innerHTML
			}
		}
	}
	return block;
};

IdModule.prototype.clear = function(id) {
	if (id === undefined) {
		this.store = {};
	} else if (id == null || id == false) {
		console.warn('id.clear expects undefined or something not null');
	} else if (!this.store[id]) {
		console.warn('id.clear expects store to contain id', id);
	} else {
		delete this.store[id];
	}
};

IdModule.prototype.get = function(id) {
	return this.store[id];
};

IdModule.prototype.set = function(data) {
	if (data && data.id) data = [data];
	for (var i = 0; i < data.length; i++) {
		this.store[data[i].id] = data[i];
	}
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
		block.id = "id" + Date.now();
		editor.modules.id.set(block);
	}
	dom.setAttribute('block-id', block.id);
}


