exports.define = defineSpecs;
exports.nodeToData = nodeToData;
exports.nodeToContent = nodeToContent;
exports.blockToAttr = blockToAttr;

var index;

function defineSpecs(main, element, schemaSpecs, rendererName, dom) {
	var content = [];
	var contentName = dom && dom.getAttribute('block-content');
	var specName, spec, recursive = false;
	if (!dom) {
		index = 0;
		dom = main.render(rendererName, { type: element.name });
		spec = createRootSpec(main, element, main.nodeViews, rendererName, dom);
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(element, main.nodeViews, dom);
		spec.content = element.specs[contentName];
		if (!spec.content) throw new Error("Missing element.specs[" + contentName + "]");
		specName = spec.specName + '[block_content="' + contentName + '"]';
	} else if (dom.querySelector('[block-content]')) {
		spec = createWrapSpec(element, main.nodeViews, dom);
		recursive = true;
	} else {
		spec = createHoldSpec(element, main.nodeViews, dom);
	}
	if (!specName) specName = spec.specName;

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpecs(main, element, schemaSpecs, rendererName, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		// use original specName here
		schemaSpecs.nodes = schemaSpecs.nodes.addToEnd(spec.specName, spec);
	}
	return specName;
}

function createRootSpec(main, element, nodeViews, rendererName, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(Object.assign({
		id: null,
		block_focused: null,
		block_url: null,
		block_type: element.name
	}, defaultAttrs));

	return {
		specName: "root_" + element.name,
		typeName: "root",
		group: element.group,
		inline: !!element.inline,
		defining: true,
		attrs: Object.assign({}, defaultSpecAttrs, specAttrs(element.properties, "data-")),
		parseDOM: [{
			tag: rootSelector(defaultAttrs),
			getAttrs: function(dom) {
				var block = main.resolve(dom);
				var newDom = main.render(rendererName, block);
				while (dom.firstChild) dom.removeChild(dom.firstChild);
				while (newDom.firstChild) dom.appendChild(newDom.firstChild);
				for (var k in newDom.attributes) {
					var att = newDom.attributes[k];
					dom.setAttribute(att.name, att.value);
				}
				prepareDom(element, dom);
				return blockToAttr(block);
			}
		}],
		toDOM: function(node) {
			var view = rendererName == "view";
			var type = node.type.typeName;
			if (view) return main.render(rendererName, {
				type: node.attrs.block_type,
				url: node.attrs.block_url,
				data: nodeToData(node),
				content: nodeToContent(main, node)
			});
			var dom = main.render(rendererName, {
				type: node.attrs.block_type,
				url: node.attrs.block_url,
				data: nodeToData(node)
			});
			prepareDom(element, dom);
			var attrs = Object.assign(domAttrs(node.attrs), nodeAttrs(dom));
			if (attrs.block_focused) dom.setAttribute('block-focused', '');
			else if (dom.hasAttribute('block-focused')) dom.removeAttribute('block-focused');
			return [dom.nodeName, attrs, 0];
		}
	};
}

function nodeToData(node) {
	var data = {};
	for (var k in node.attrs) {
		if (k.indexOf('data-') == 0) {
			data[k.substring(5)] = node.attrs[k];
		}
	}
	return data;
}

function nodeToContent(main, node, content) {
	var type = node.type.spec.typeName;
	if (type == "content") {
		content[node.attrs.block_content] = main.serializers.view.serializeNode(node);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			nodeToContent(main, child, content);
		});
	}
	return content;
}

function parseRoot(dom) {

}

function blockToAttr(block) {
	var attrs = {};
	for (var k in block.data) {
		attrs['data-' + k] = block.data[k];
	}
	attrs.block_type = block.type;
	attrs.block_url = block.url;
	attrs.block_focused = block.focused;
	return attrs;
}

function createWrapSpec(element, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		specName: "wrap_" + element.name + index++,
		typeName: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: domSelector(defaultAttrs),
			getAttrs: function(dom) {
				if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "wrap") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createContentSpec(element, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		specName: "content_" + element.name + index++,
		typeName: "content",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: defaultAttrs.tag + '[block-content="'+defaultAttrs.block_content+'"]',
			getAttrs: function(dom) {
				if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "content") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createHoldSpec(element, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var sel = domSelector(defaultAttrs);
	var defaultSpecAttrs = specAttrs(Object.assign(defaultAttrs, {
		html: dom.outerHTML
	}));

	return {
		specName: "hold_" + element.name + index++,
		typeName: "hold",
		selectable: false,
		isLeaf: true, // replaces readonly patch
		attrs: defaultSpecAttrs,
		parseDOM: [{ tag: sel, getAttrs: function(dom) {
			if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "hold") return false;
			var attrs = tagAttrs(dom);
			attrs.html = dom.outerHTML;
			if (defaultSpecAttrs.block_handle) dom.setAttribute('block-handle', '');
			return attrs;
		}}],
		toDOM: function(node) {
			var div = document.createElement("div");
			div.innerHTML = node.attrs.html;
			var elem = div.querySelector('*');
			if (!elem) throw new Error("Wrong html on HoldType", node, defaultAttrs);
			if (defaultSpecAttrs.block_handle) elem.setAttribute('block-handle', '');
			elem.setAttribute('contenteditable', 'false');
			return elem;
		}
	};
}

function prepareDom(element, dom) {
	var name;
	for (var i=0, child; i < dom.childNodes.length; i++) {
		child = dom.childNodes.item(i);
		if (child.nodeType != Node.ELEMENT_NODE) continue;
		name = child.getAttribute('block-content');
		if (!child.pagecut) child.pagecut = {};
		child.pagecut.name = element.name;
		if (name) {
			child.pagecut.type = "content";
		} else if (child.querySelector('[block-content]')) {
			child.pagecut.type = "wrap";
			prepareDom(element, child);
		} else {
			child.pagecut.type = "hold";
		}
	}
}

function domAttrs(attrs) {
	var obj = {};
	Object.keys(attrs).forEach(function(k) {
		if (k == 'tag' || k == 'html' || k.indexOf('data-') == 0) return;
		obj[k.replace(/_/g, '-')] = attrs[k];
	});
	return obj;
}

function tagAttrs(dom) {
	var obj = nodeAttrs(dom, true);
	obj.tag = dom.nodeName.toLowerCase();
	return obj;
}

function specAttrs(atts, prefix) {
	var obj = {};
	prefix = prefix || "";
	var val;
	for (var k in atts) {
		val = atts[k];
		if (val && val.default !== undefined) val = val.default;
		else if (typeof val != "string") val = null;
		obj[prefix + k] = {
			'default': val
		};
	}
	return obj;
}

function nodeAttrs(node, convert) {
	var obj = {};
	var atts = node.attributes;
	var att, name;
	for (var i=0; i < atts.length; i++) {
		att = atts[i];
		name = att.name;
		if (convert) name = name.replace(/-/g, '_');
		obj[name] = att.value;
	}
	return obj;
}

function domSelector(attrs) {
	var sel = attrs.tag;
	var className = attrs.class;
	if (className) sel += "." + className.split(' ').join('.');
	return sel;
}

function rootSelector(attrs) {
	var sel = attrs.tag + '[block-type="'+attrs.block_type+'"]';
	return sel;
}
