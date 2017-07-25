function Block(obj) {
	Object.assign(this, obj);
}

Block.prototype.render = function(view) {
	var el = view.map[this.type];
	if (!el) throw new Error(`Unknown block.type ${this.type}`);
	var dom = el.render(view.doc, this, view);
	if (dom.nodeType == Node.ELEMENT_NODE) {
		dom.setAttribute('block-type', this.type);
		if (this.id) dom.setAttribute('block-id', this.id);
		else dom.removeAttribute('block-id');
	}
};

Block.prototype.parse = function() {
	var contents = this.content;
	var copy = this.copy();
	var content, div, frag;
	for (var name in contents) {
		content = contents[name];
		if (content instanceof Node) {
			frag = content;
		} else {
			div = this.doc.createElement("div");
			div.innerHTML = content;
			frag = this.doc.createDocumentFragment();
			while (div.firstChild) frag.appendChild(div.firstChild);
		}
		copy.content[name] = frag;
	}
	return copy;
};

Block.prototype.serialize = function() {
	var contents = this.content;
	var copy = this.copy();
	var content, html, child;
	for (var name in contents) {
		content = contents[name];
		if (content instanceof Node) {
			html = "";
			for (var i=0; i < content.childNodes.length; i++) {
				child = content.childNodes[i];
				if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
				else html += child.outerHTML;
			}
		} else {
			html = content;
		}
		copy.content[name] = html;
	}
	return copy;
};

Block.prototype.copy = function() {
	var copy = new Block(this);
	copy.data = Object.assign({}, this.data);
	copy.content = Object.assign({}, this.content);
	return copy;
};

Block.prototype.merge = function(dom) {
	var contents = this.content;
	if (!contents) return;
	Object.keys(contents).forEach(function(name) {
		var blockContent = dom.getAttribute('block-content');
		var node;
		if (blockContent) {
			if (name == blockContent) node = dom;
		} else {
			node = dom.querySelector(`[block-content="${name}"]`);
		}
		if (!node) return;
		var content = contents[name];
		if (!content) return;
		node.appendChild(node.ownerDocument.importNode(content, true));
	});
};

