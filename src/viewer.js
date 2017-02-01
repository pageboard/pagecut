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
	revive(this.doc, block);
	var dom = renderFn.call(el, this.doc, block);
	if (block.content) Object.keys(block.content).forEach(function(name) {
		var contentNode = dom.querySelector('[block-content="'+name+'"]');
		if (!contentNode) return;
		contentNode.innerHTML = block.content[name].innerHTML;
	});
	var main = this;
	var ndom;
	Object.keys(this.modifiers).forEach(function(k) {
		ndom = main.modifiers[k](main, block, dom);
		if (ndom) dom = ndom;
	});
	return dom;
};

function renderDocumentBlock(document, block) {
	return block.content.document || document.createElement("div");
}

function revive(doc, block) {
	var contents = block.content;
	var name, content, div;
	for (name in contents) {
		content = contents[name];
		if (content && typeof content == "string") {
			div = doc.createElement("div");
			div.innerHTML = content;
			contents[name] = div;
		}
	}
}

