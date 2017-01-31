module.exports = Viewer;

var DocumentElement = {
	name: 'document',
	view: renderDocumentBlock
};

function Viewer(opts) {
	this.doc = document.implementation.createHTMLDocument();
	var modules = global.Pagecut && global.Pagecut.modules || {};
	this.resolvers = opts.resolvers || {};
	this.elements = opts.elements || {};
	if (!this.elements.document) this.elements.document = DocumentElement;
	this.modifiers = opts.modifiers || {};
	var main = this;

	Object.keys(modules).forEach(function(k) {
		modules[k](main);
	});
}

Viewer.prototype.resolve = function(thing) {
	var obj = {};
	if (typeof thing == "string") obj.url = thing;
	else obj.node = thing;
	var main = this;
	var syncBlock;
	Object.keys(this.resolvers).some(function(k) {
		syncBlock = main.resolvers[k](main, obj, function(err, block) {
			var oldDom = document.getElementById(syncBlock.id);
			if (!oldDom) return;
			if (err) {
				console.error(err);
				main.remove(oldDom);
			} else {
				if (syncBlock.focused) block.focused = true;
				else delete block.focused;
				main.replace(oldDom, block);
			}
		});
		if (syncBlock) return true;
	});
	// TODO it would be nice to not rely upon the DOM to replace the temporary block
	if (syncBlock && !syncBlock.id) syncBlock.id = "id-" + Date.now();
	return syncBlock;
};

Viewer.prototype.render = function(block, edition) {
	var type = block.type;
	if (!type) throw new Error("Missing block type");
	var el = this.elements[type];
	if (!el) throw new Error("Missing element " + type);
	var renderFn = edition && el.edit || el.view;
	if (!renderFn) throw new Error("Missing render function for block type " + type);
	block = Object.assign({}, block);
	if (!block.data) block.data = {};
	if (!block.content) block.content = {};
	var dom = renderFn.call(el, this.doc, block);
	if (block.content) Object.keys(block.content).forEach(function(name) {
		var contentNode = dom.querySelector('[block-content="'+name+'"]');
		if (!contentNode) return;
		var val = block.content[name];
		// TODO if val is a string it's an OFFLINE content - something more must be done ?
		if (!val.nodeType) contentNode.innerHTML = val;
		else contentNode.parentNode.replaceChild(val, contentNode);
	});
	var main = this;
	Object.keys(this.modifiers).forEach(function(k) {
		main.modifiers[k](main, block, dom);
	});
	return dom;
};

function renderDocumentBlock(document, block) {
	var content = block.content.document;
	var div = document.createElement('div');
	if (content == null) return div;
	if (typeof content == "string") {
		div.innerHTML = content;
		return div;
	} else {
		div.appendChild(content);
	}
	return div;
}
