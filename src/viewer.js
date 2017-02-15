module.exports = Viewer;

var FragmentElement = {
	name: 'fragment',
	view: renderFragment
};

function Viewer(opts) {
	if (!opts) opts = {};
	this.doc = opts.document || document.implementation.createHTMLDocument();
	var modules = Object.assign({}, global.Pagecut && global.Pagecut.modules, opts.modules);
	this.elements = opts.elements || {};
	if (!this.elements.fragment) this.elements.fragment = FragmentElement;
	this.modifiers = opts.modifiers || {};
	if (!this.modifiers.content) this.modifiers.content = contentModifier;
	var main = this;
	main.modules = {};

	Object.keys(modules).forEach(function(k) {
		main.modules[k] = new modules[k](main);
	});
}

Viewer.prototype.render = function(block, edition) {
	var type = block.type;
	if (!type) throw new Error("Missing block type");
	var el = this.elements[type];
	if (!el) throw new Error("Missing element " + type);
	var renderFn = edition && el.edit || el.view;
	if (!renderFn) throw new Error("Missing render function for block type " + type);
	block = this.copy(block, true);
	var dom = renderFn.call(el, this.doc, block);
	var main = this;
	var ndom = dom;
	Object.keys(this.modifiers).forEach(function(k) {
		ndom = main.modifiers[k](main, block, ndom) || ndom;
	});
	return ndom;
};

Viewer.prototype.copy = function(block, withDomContent) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	copy.content = Object.assign({}, block.content);
	var contents = copy.content;
	var name, content, div, isNode;
	for (name in contents) {
		content = contents[name];
		if (!content) continue;
		isNode = content instanceof Node;
		if (withDomContent) {
			if (isNode) continue;
			div = this.doc.createElement("div");
			div.innerHTML = content;
			contents[name] = div;
		} else {
			if (!isNode) continue;
			contents[name] = content.innerHTML;
		}
	}
	return copy;
};

function renderFragment(document, block) {
	return block.content.fragment || document.createElement("div");
}

function contentModifier(main, block, dom) {
	var contents = block.content;
	if (!contents) return;
	Object.keys(contents).forEach(function(name) {
		var contentNode = dom.querySelector('[block-content="'+name+'"]');
		if (!contentNode) return;
		contentNode.innerHTML = contents[name].innerHTML;
	});
}

