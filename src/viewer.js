module.exports = Viewer;

var BlocksView = require('./blocks-view');

function Viewer(opts) {
	if (!opts) opts = {};
	this.blocks = new BlocksView(this, opts);

	this.doc = opts.document || document.cloneNode();
	this.elements = opts.elements || {};

	// TODO remove this probably useless part
	var map = this.elements = opts.elements || {};
	if (!map.fragment) map.fragment = {
		contents: {
			fragment: {
				spec: "block*"
			}
		},
		render: function renderFragment(block, scope) {
			return block.content.fragment || scope.$doc.createElement("div");
		}
	};
}

Viewer.prototype.from = function(block, blocks, overrideType, scope) {
	return this.blocks.from(block, blocks, overrideType, scope);
};

Viewer.prototype.element = function(type) {
	if (!type) return;
	return this.elements[type];
};

Viewer.prototype.render = function(block, opts) {
	var dom;
	if (typeof opts == "string") {
		opts = {type: opts};
		console.warn("view.render now expects opts.type, not string");
	}
	var type = (opts || {}).type || block.type;
	try {
		dom = this.blocks.render(block, opts);
	} catch(ex) {
		console.error(ex);
	}
	if (!dom) return;
	if (dom.nodeName == "HTML") {
		// documentElement is not editable
		if (this.doc.documentElement) {
			this.doc.removeChild(this.doc.documentElement);
		}
		this.doc.appendChild(dom);
		dom = dom.querySelector('body');
		if (!dom) {
			console.error(`${type} returns a document element but does not contain a body`);
		}
	}
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) return dom;

	var el = this.element(type);
	dom.setAttribute('block-type', type);
	if (!el.inplace) {
		if (block.id != null) dom.setAttribute('block-id', block.id);
		else dom.removeAttribute('block-id');
	} else {
		dom.removeAttribute('block-id');
		if (block.data) dom.setAttribute('block-data', JSON.stringify(block.data));
	}
	if (block.expr) {
		dom.setAttribute('block-expr', JSON.stringify(block.expr));
	}

	if (block.focused) dom.setAttribute('block-focused', block.focused);
	else dom.removeAttribute('block-focused');

	return dom;
};

