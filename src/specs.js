exports.define = defineSpecs;
exports.attrToBlock = attrToBlock;
exports.blockToAttr = blockToAttr;
exports.nodeToContent = nodeToContent;

var index;

function defineSpecs(editor, element, schemaSpecs, dom) {
	var contents = [];
	var contentName = dom && dom.getAttribute('block-content');
	var specName, spec, recursive = false;
	if (!dom) {
		index = 0;
		dom = (element.edit || element.view).call(element, editor.doc, {
			type: element.name,
			data: {},
			content: {}
		});
		spec = createRootSpec(editor, element, dom);
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(element, dom);
		var content = element.contents[contentName];
		if (!content) throw new Error("Missing element.contents[" + contentName + "]");
		spec.content = content.spec;
		specName = spec.specName + '[block_content="' + contentName + '"]';
	} else if (dom.querySelector('[block-content]')) {
		spec = createWrapSpec(element, dom);
		recursive = true;
	} else {
		spec = createHoldSpec(element, dom);
	}
	if (!specName) specName = spec.specName;

	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			contents.push(defineSpecs(editor, element, schemaSpecs, child));
		}
		if (contents.length) {
			spec.content = contents.join(" ");
		} else if (spec.typeName == "root" && element.contents) {
			var specKeys = Object.keys(element.contents);
			var contentName = dom.getAttribute('block-content');
			if (specKeys.length == 1) {
				if (contentName == specKeys[0]) {
					spec.content = element.contents[contentName].spec;
				} else {
					console.warn("element has no matching contents", element.contents, contentName);
				}
			} else if (specKeys.length > 1) {
				console.warn("element has multiple contents", element.contents, "only one default block-content is allowed");
			}
		}
	}
	if (spec) {
		// use original specName here
		if (spec.inline) {
			schemaSpecs.marks = schemaSpecs.marks.addToEnd(spec.specName, spec);
		} else {
			schemaSpecs.nodes = schemaSpecs.nodes.addToEnd(spec.specName, spec);
		}

	}
	return specName;
}

function createRootSpec(editor, element, dom) {
	var defaultAttrs = Object.assign({
		block_id: null,
		block_focused: null,
		block_url: null,
		block_type: element.name
	}, tagAttrs(dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var spec = {
		specName: element.name,
		typeName: "root",
		inline: !!element.inline,
		defining: !element.inline,
		isolating: !element.inline,
		attrs: Object.assign({}, defaultSpecAttrs, specAttrs(element.properties, "data-")),
		parseDOM: [{
			tag: '[block-type="'+element.name+'"]',
			getAttrs: function(dom) {
				var block = editor.resolve(dom);
				if (!block) {
					// default resolver ?
					block = {
						type: element.name,
						data: nodeAttrs(dom)
					};
					console.warn("Parsing unresolved block", block);
				} else {
					// all these is view.render without modifiers
					// ensure the block is on-shell
					var copy = editor.copy(block, true);
					// avoid modifiers
					var newDom = (element.edit || element.view).call(element, editor.doc, copy);
					// call merge ourselves
					editor.merge(copy, newDom);
					if (!element.inline) {
						while (dom.firstChild) dom.removeChild(dom.firstChild);
						while (newDom.firstChild) dom.appendChild(newDom.firstChild);
					}
					var domAttrs = dom.attributes;
					for (var j=0; j < domAttrs.length; j++) {
						dom.removeAttribute(domAttrs[j].name);
					}
					var newAttrs = newDom.attributes;
					for (var k=0; k < newAttrs.length; k++) {
						dom.setAttribute(newAttrs[k].name, newAttrs[k].value);
					}
				}
				prepareDom(element, dom);
				return blockToAttr(block);
			}
		}],
		toDOM: function(node) {
			var block = attrToBlock(node.attrs);
			block.content = {};
			var dom = (element.edit || element.view).call(element, editor.doc, block);
			var ndom = dom;
			if (ndom.nodeType == Node.ELEMENT_NODE) {
				for (var i=0; i < editor.modifiers.length; i++) {
					ndom = editor.modifiers[i](editor, block, ndom) || ndom;
				}
				if (ndom) dom = ndom;
			}
			// update node attrs
			var mAttrs = blockToAttr(block);
			for (var k in mAttrs) node.attrs[k] = mAttrs[k];
			var attrs = nodeAttrs(dom);
			return element.inline ? [dom.nodeName, attrs] : [dom.nodeName, attrs, 0];
		}
	};
	if (element.group) spec.group = element.group;
	return spec;
}

function blockToAttr(block) {
	var attrs = {};
	for (var k in block.data) {
		attrs['data-' + k] = block.data[k];
	}
	for (var k in block) {
		if (k != 'data' && k != 'content' && block[k]) {
			attrs['block_' + k] = block[k];
		}
	}
	return attrs;
}

function attrToBlock(attrs) {
	var block = {data: {}};
	var name;
	for (var k in attrs) {
		if (!attrs[k]) continue;
		if (k.indexOf('data-') == 0) {
			block.data[k.substring(5)] = attrs[k];
		} else if (k.indexOf('block_') == 0) {
			name = k.substring(6);
			if (name != "content") block[name] = attrs[k];
		}
	}
	return block;
}

function nodeToContent(serializer, node, content) {
	var type = node.type.spec.typeName;

	if (type == "content") {
		content[node.attrs.block_content] = serializer.serializeFragment(node.content);
	} else if (type == "root" && node.attrs.block_content) {
		if (!content) content = {};
		content[node.attrs.block_content] = serializer.serializeFragment(node.content);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			nodeToContent(serializer, child, content);
		});
	}
	return content;
}

function createWrapSpec(element, dom) {
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

function createContentSpec(element, dom) {
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

function createHoldSpec(element, dom) {
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

