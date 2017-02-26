module.exports = Viewer;

function Viewer(opts) {
	if (!opts) opts = {};
	this.doc = opts.document || document.implementation.createHTMLDocument();
	this.serializer = new XMLSerializer();
	var modules = Object.assign({
		fragment: FragmentModule,
		content: ContentModule
	}, global.Pagecut && global.Pagecut.modules, opts.modules);

	this.elements = opts.elements || [];
	this.modifiers = opts.modifiers || [];

	var main = this;
	main.modules = {};

	Object.keys(modules).forEach(function(k) {
		main.modules[k] = new modules[k](main);
	});

	var map = this.map = {};
	for (var i=0; i < this.elements.length; i++) {
		map[this.elements[i].name] = this.elements[i];
	}
}

Viewer.prototype.render = function(block, edition) {
	var type = block.type;
	if (!type) throw new Error("Missing block type");
	var el = this.map[type];
	if (!el) throw new Error("Missing element " + type);
	var renderFn = edition && el.edit || el.view;
	if (!renderFn) throw new Error("Missing render function for block type " + type);
	block = this.copy(block, true);
	var dom = renderFn.call(el, this.doc, block);
	var ndom = dom;
	for (var i=0; i < this.modifiers.length; i++) {
		ndom = this.modifiers[i](this, block, ndom) || ndom;
	}
	return ndom;
};

Viewer.prototype.copy = function(block, withDomContent) {
	var copy = Object.assign({}, block);
	copy.data = Object.assign({}, block.data);
	copy.content = Object.assign({}, block.content);
	var contents = copy.content;
	var name, content, div, frag, isNode;
	for (name in contents) {
		content = contents[name];
		if (!content) continue;
		isNode = content instanceof Node;
		if (withDomContent) {
			if (isNode) continue;
			div = this.doc.createElement("div");
			div.innerHTML = content;
			frag = this.doc.createDocumentFragment();
			while (div.firstChild) frag.appendChild(div.firstChild);
			contents[name] = frag;
		} else {
			if (!isNode) continue;
			contents[name] = this.serializer.serializeToString(content);
		}
	}
	return copy;
};


function FragmentModule(main) {
	main.elements.push({
		name: 'fragment',
		view: function renderFragment(document, block) {
			return block.content.fragment || document.createElement("div");
		}
	});
}

function ContentModule(main) {
	main.modifiers.push(function contentModifier(main, block, dom) {
		var contents = block.content;
		if (!contents) return;
		Object.keys(contents).forEach(function(name) {
			var blockContent = dom.getAttribute('block-content');
			var node;
			if (blockContent) {
				if (name == blockContent) node = dom;
			} else {
				node = dom.querySelector('[block-content="'+name+'"]');
			}
			if (!node) return;
			node.appendChild(contents[name].cloneNode(true));
		});
	});
}

