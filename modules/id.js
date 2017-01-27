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

IdModule.blocks = function(main) {
	var replacer = new IdReplacer(main);
	var store = replacer.run(main);
	return store;
};

function IdReplacer(main) {
	this.store = {};
	main.modifiers.IdReplacer = this.modifier.bind(this);
}
IdReplacer.prototype.modifier = function(main, block, dom) {
	var id = block.id;
	if (!id) return;
	var prev = this.store[id];
	if (prev) {
		console.error("has already a block", block);
	} else {
		this.store[id] = block;
		dom.empty();
	}
};
IdReplacer.prototype.run = function(main) {
	console.log("TODO build a document block");
	/*
	var xtore = {};
	xtore.document = {
		type: 'document',
		content: {
			root: dom
		}
	};
	*/
	var dom = main.get();
	delete main.modifiers.IdReplacer;
	console.log("TODO serialize html");
	return this.store;
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


