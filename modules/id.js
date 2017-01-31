module.exports = IdModule;

var IdElement = {
	name: 'id',
	edit: function(main, block) {
		var div = document.createElement("div");
		div.setAttribute('block-state', 'loading');
		return div;
	}
};

function IdModule(main) {
	main.resolvers.id = IdResolver;
	main.modifiers.id = IdModifier;
	main.elements.id = IdElement;
}

// render blocks as DOM
IdModule.from = fromBlock;

function fromBlock(main, html, blocks) {
	var fragment = main.render({
		type: 'document',
		content: {
			document: html
		}
	});
	var list = fragment.querySelectorAll('[block-id]');
	for (var i=0; i < list.length; i++) {
		var node = list.item(i);
		var id = node.getAttribute('block-id');
		var block = blocks[id];
		if (!block) {
			console.error("Unknown block id", id);
			continue;
		}
		// replace recursively
		node.parentNode.replaceChild(fromBlock(main, block, blocks), node);
	}
	return fragment;
};

// export editor as blocks
IdModule.to = function(main) {
	var list = [];
	main.modifiers.IdTo = function(main, block, dom) {
		if (block.id) {
			var div = dom.ownerDocument.createElement('div');
			div.setAttribute('block-id', block.id);
			list.push(block);
			return div;
		}
	};

	var domFragment = main.get();
	delete main.modifiers.IdTo;

	var blocks = {};
	for (var i = list.length - 1; i >= 0; i--) {
		var block = list[i];
		blocks[block.id] = block;
		for (var name in block.content) {
			block.content[name] = block.content[name].innerHTML;
		}
	}
	var div = domFragment.ownerDocument.createElement("div");
	div.appendChild(domFragment);

	return {
		html: div.innerHTML,
		blocks: blocks
	};
};

// this is exposed for clients, pagecut does not know about this interface
IdModule.store = {};
IdModule.get = function(url) {
	var data = this.store[id];
	data.id = id;
	return data;
};
IdModule.set = function(data) {
	if (data && data.id) data = [data];
	for (var i = 0; i < data.length; i++) {
		this.store[data[i].id] = data[i];
	}
};

function IdResolver(main, obj, cb) {
	var id = obj.node && obj.node.getAttribute('block-id');
	if (!id) return;
	var block = IdModule.get(id);
	if (block) return block;
	if (IdResolver.fetch) IdResolver.fetch(id, function(err, block) {
		if (err) return cb(err);
		IdModule.set(block);
		cb(null, block);
	});
	return {
		type: 'id',
		id: id
	};
}

function IdModifier(main, block, dom) {
	if (block.id != null) dom.setAttribute('block-id', block.id);
	else dom.removeAttribute('block-id');
}


