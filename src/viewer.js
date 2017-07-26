module.exports = Viewer;

var Blocks = require('./blocks');

function Viewer(opts) {
	if (!opts) opts = {};
	this.doc = opts.document || document.implementation.createHTMLDocument();

	var modules = Object.assign({
		fragment: {
			render: function renderFragment(doc, block) {
				return block.content.fragment || doc.createElement("div");
			}
		}
	}, global.Pagecut && global.Pagecut.modules, opts.modules);

	this.elements = opts.elements || [];
	this.modifiers = opts.modifiers || [];
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

Viewer.prototype.element = function(type) {
	if (!type) return;
	return this.elementsMap[type];
};

Viewer.prototype.render = function(block) {
	var dom = this.blocks.render(block);
	if (!dom) return "";
	var ndom = dom;
	if (ndom.nodeType != Node.ELEMENT_NODE) return ndom;
	dom.setAttribute('block-id', block.id);
	for (var i=0; i < this.modifiers.length; i++) {
		ndom = this.modifiers[i](this, block, ndom) || ndom;
	}
	return ndom;
};

