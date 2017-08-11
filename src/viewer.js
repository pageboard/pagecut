module.exports = Viewer;

var Blocks = require('./blocks');

function Viewer(opts) {
	if (!opts) opts = {};
	this.doc = opts.document || document.implementation.createHTMLDocument();

	var modules = Object.assign({
		fragment: {
			contents: {
				fragment: {
					spec: "block*"
				}
			},
			render: function renderFragment(doc, block) {
				return block.content.fragment || doc.createElement("div");
			}
		}
	}, global.Pagecut && global.Pagecut.modules, opts.modules);

	this.elements = opts.elements || [];
	this.plugins = opts.plugins || [];

	var viewer = this;
	viewer.modules = {};

	Object.keys(modules).forEach(function(k) {
		var mod = modules[k];
		if (typeof mod == "function") {
			viewer.modules[k] = new modules[k](viewer);
		} else {
			mod.name = k;
			viewer.elements.push(mod);
		}
	});

	var map = this.elementsMap = {};
	for (var i=0; i < this.elements.length; i++) {
		map[this.elements[i].name] = this.elements[i];
	}

	this.blocks = new Blocks(this);
}

Viewer.prototype.from = function(blocks) {
	return this.blocks.from(blocks);
};

Viewer.prototype.to = function(blocks) {
	return this.blocks.to(blocks);
};

Viewer.prototype.element = function(type) {
	if (!type) return;
	return this.elementsMap[type];
};

Viewer.prototype.render = function(block) {
	var dom = this.blocks.render(block);
	if (dom.nodeType != Node.ELEMENT_NODE) return dom;

	dom.setAttribute('block-type', block.type);

	if (block.id != null) dom.setAttribute('block-id', block.id);
	else dom.removeAttribute('block-id');

	if (block.focused) dom.setAttribute('block-focused', block.focused);
	else dom.removeAttribute('block-focused');

	return dom;
};

