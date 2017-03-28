module.exports = IdModule;

function IdModule(main) {
	this.store = {};
	this.main = main;
	if (main.resolvers) main.resolvers.push(IdResolver);
	main.modifiers.push(IdModifier);
	main.elements.push(IdModule.element);

	var me = this;

	main.plugins.push({
		props: {
			transformPasted: function(pslice) {
				pslice.content.forEach(function(child) {
					me.pasteNode(child);
					child.descendants(function(node, pos, parent) {
						me.pasteNode(node);
					});
				});
				return pslice;
			}
		}
	});
}

IdModule.element = {
	name: 'id',
	view: function(doc, block) {
		return doc.createElement("div");
	}
};

IdModule.prototype.pasteNode = function(node) {
	var id = node.attrs.block_id;
	if (id == null && node.marks.length > 0) {
		node = node.marks[0];
		id = node.attrs.block_id;
	}
	if (id == null) return;
	var block = this.get(id);
	var dom = this.main.view.dom.querySelector('[block-id="'+id+'"]');
	// if the block is not known, just do nothing
	if (!block) {
		// warn if there's a bug
		if (dom) console.error("Unknown block but dom node exists", id);
		return;
	}
	block = this.main.copy(block, true);
	block.id = 'id' + Date.now();
	this.main.modules.id.set(block);
	node.attrs.block_id = block.id;
};


IdModule.prototype.from = function(rootBlock, resolver) {
	if (!rootBlock) rootBlock = "";
	if (typeof rootBlock == "string") rootBlock = {
		type: 'fragment',
		content: {
			fragment: rootBlock
		}
	};
	var fragment = this.main.render(rootBlock);
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
	var main = this.main;
	var origModifiers = main.modifiers;
	main.modifiers = origModifiers.concat([function(main, block, dom) {
		if (block.id) {
			var ndom = dom.ownerDocument.createElement(main.map[block.type].inline ? 'span' : 'div');
			ndom.setAttribute('block-id', block.id);
			// make sure we don't accidentally store focused state
			ndom.removeAttribute('block-focused');
			list.push(block);
			return ndom;
		}
	}]);

	var domFragment = main.get();

	main.modifiers = origModifiers;

	var block;
	for (var i = list.length - 1; i >= 0; i--) {
		block = list[i];
		this.store[block.id] = main.copy(block, false);
	}
	var div = domFragment.ownerDocument.createElement("div");
	div.appendChild(domFragment);

	return {
		type: 'fragment',
		content: {
			fragment: div.innerHTML
		}
	};
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

function IdResolver(main, obj, cb) {
	var id = obj.node && obj.node.getAttribute('block-id');
	if (!id) return;
	var block = main.modules.id.get(id);
	if (block) return block;
	if (IdResolver.fetch) IdResolver.fetch(id, function(err, block) {
		if (err) return cb(err);
		main.modules.id.set(block);
		cb(null, block);
	});
	return {
		type: 'id',
		id: id
	};
}

function IdModifier(main, block, dom) {
	if (block.id == null) {
		var id = "id" + Date.now();
		block.id = id;
		main.modules.id.set(block);
	}
	dom.setAttribute('block-id', block.id);
	// when using id module, block-id is used to find the block and block.type
	dom.removeAttribute('block-type');
}


