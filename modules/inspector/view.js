(function(exports) {

exports.inspector = InspectorModule;

function InspectorModule(main) {
	this.main = main;
	main.elements.push(InspectorModule.element);
	if (InspectorModule.resolver) main.resolvers.push(InspectorModule.resolver);
	this.store = {};
}

InspectorModule.element = {
	name: 'inspector',
	view: InspectorView
};

// this is exposed for clients, pagecut does not know about this interface
InspectorModule.prototype.store = {};
InspectorModule.prototype.get = function(url) {
	return this.store[url];
};
InspectorModule.prototype.set = function(blocks) {
	if (blocks && blocks.data) blocks = [blocks];
	for (var i = 0; i < blocks.length; i++) {
		this.store[blocks[i].url] = blocks[i];
	}
};

function InspectorView(document, block) {
	var data = block.data;
	var content = block.content;
	if (data.type == "link") {
		var anchor = document.createElement('a');
		anchor.href = block.url;
		if (content.title) anchor.setAttribute('title', content.title.firstChild.nodeValue);
		else anchor.removeAttribute('title');
		anchor.textContent = '';
		if (content.content) anchor.appendChild(content.content);
		return anchor;
	} else if (data.html) {
		var div = document.createElement('div');
		for (var k in data) {
			if (k == 'html') continue;
			div.setAttribute('data-' + k, data[k]);
		}
		div.innerHTML = data.html;
		return div;
	}
}

})(window.Pagecut.modules);
