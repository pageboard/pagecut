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
		var renderFn = element.edit || element.view;
		if (!renderFn) return;
		dom = renderFn.call(element, editor.doc, {
			type: element.name,
			data: {},
			content: {}
		}, editor);
		if (!dom) throw new Error(element.name + " element must render a DOM Node");
		spec = createRootSpec(editor, element, dom);
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(element, dom);
		var content = element.contents[contentName];
		if (!content) throw new Error(`Missing element.contents[${contentName}]`);
		spec.content = content.spec;
		specName = `${spec.specName}[block_content="${contentName}"]`;
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
		block_type: element.name,
		block_data: null
	}, attrsFrom(dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var noContent = Object.keys(element.contents || {}).length == 0;

	var spec = {
		specName: element.name,
		typeName: "root",
		inline: !!element.inline,
		defining: !element.inline,
		isolating: !element.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [{
			tag: `[block-type="${element.name}"]`,
			getAttrs: function(dom) {
				var block = editor.resolve(dom);
				if (block.type == "id") {
					block = null;
					console.error("Fix id module");
				}
				var attrs = attrsFrom(dom);
				prepareDom(element, dom);
				return Object.assign(block ? blockToAttr(block) : {}, attrs);
			}
		}],
		toDOM: function(node) {
			var block = attrToBlock(node.attrs);
			block.content = {};
			var dom = (element.edit || element.view).call(element, editor.doc, block, editor);
			if (!dom) throw new Error(element.name + " element must render a DOM Node");
			var ndom = dom;
			if (ndom.nodeType == Node.ELEMENT_NODE) {
				for (var i=0; i < editor.modifiers.length; i++) {
					ndom = editor.modifiers[i](editor, block, ndom) || ndom;
				}
				if (ndom) dom = ndom;
			}
			// update node attrs because modifiers might update block
			Object.assign(node.attrs, blockToAttr(block));

			var domAttrs = attrsTo(Object.assign(
				{},
				node.attrs,
				attrsFrom(dom)
			));

			if (element.foreign || noContent) {
				for (var k in domAttrs) {
					dom.setAttribute(k, domAttrs[k]);
				}
				return dom;
			}

			return element.inline ? [dom.nodeName, domAttrs] : [dom.nodeName, domAttrs, 0];
		}
	};
	if (element.group) spec.group = element.group;
	if (element.foreign) {
		spec.isLeaf = true;
		element.nodeView = function(node, view, getPos, decorations) {
			var block = attrToBlock(node.attrs);
			block.content = {};
			var dom = (element.edit || element.view).call(element, editor.doc, block, editor);
			if (!dom) throw new Error(`${element.name} element must render a DOM Node`);
			var ndom = dom;
			if (ndom.nodeType == Node.ELEMENT_NODE) {
				for (var i=0; i < editor.modifiers.length; i++) {
					ndom = editor.modifiers[i](editor, block, ndom) || ndom;
				}
				if (ndom) dom = ndom;
			}
			return {
				dom: dom,
				update: function(node, decorations) {
					return true;
				},
				ignoreMutation: function(record) {
					// or else face a loop
					return true;
				}
			};
		};
	}
	return spec;
}

function blockToAttr(block) {
	var attrs = {};
	if (block.id != null) attrs.block_id = block.id;
	if (block.type != null) attrs.block_type = block.type;
	if (block.data) attrs.block_data = JSON.stringify(block.data);
	if (attrs.block_data == "{}") delete attrs.block_data;
	return attrs;
}

function attrToBlock(attrs) {
	var block = {};
	if (attrs.block_id != null) block.id = attrs.block_id;
	if (attrs.block_type != null) block.type = attrs.block_type;
	if (attrs.block_data != null) block.data = JSON.parse(attrs.block_data);
	else block.data = {};
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
	var defaultAttrs = attrsFrom(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		specName: "wrap_" + element.name + index++,
		typeName: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: domSelector(dom.nodeName, defaultAttrs),
			getAttrs: function(dom) {
				if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "wrap") return false;
				return attrsFrom(dom);
			}
		}],
		toDOM: function(node) {
			return [dom.nodeName, attrsTo(node.attrs), 0];
		}
	};
}

function createContentSpec(element, dom) {
	var defaultAttrs = attrsFrom(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		specName: "content_" + element.name + index++,
		typeName: "content",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: `${dom.nodeName}[block-content="${defaultAttrs.block_content}"]`,
			getAttrs: function(dom) {
				if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "content") return false;
				return attrsFrom(dom);
			}
		}],
		toDOM: function(node) {
			return [dom.nodeName, attrsTo(node.attrs), 0];
		}
	};
}

function createHoldSpec(element, dom) {
	var defaultAttrs = attrsFrom(dom);
	var sel = domSelector(dom.nodeName, defaultAttrs);
	var defaultSpecAttrs = specAttrs(Object.assign(defaultAttrs, {
		block_html: dom.outerHTML
	}));

	return {
		specName: "hold_" + element.name + index++,
		typeName: "hold",
		selectable: false,
		isLeaf: true, // replaces readonly patch
		attrs: defaultSpecAttrs,
		parseDOM: [{ tag: sel, getAttrs: function(dom) {
			if (!dom.pagecut || dom.pagecut.name != element.name || dom.pagecut.type != "hold") return false;
			var attrs = attrsFrom(dom);
			attrs.block_html = dom.outerHTML;
			if (defaultSpecAttrs.handle) dom.setAttribute('block-handle', '');
			return attrs;
		}}],
		toDOM: function(node) {
			var div = document.createElement("div");
			div.innerHTML = node.attrs.block_html;
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

function attrsTo(attrs) {
	var domAttrs = {};
	for (var k in attrs) domAttrs[k.replace(/_/g, '-')] = attrs[k];
	return domAttrs;
}

function attrsFrom(dom) {
	var domAttrs = dom.attributes;
	var att, attrs = {}, name;
	for (var i=0; i < domAttrs.length; i++) {
		att = domAttrs[i];
		attrs[att.name.replace(/-/g, '_')] = att.value;
	}
	return attrs;
}

function specAttrs(atts) {
	var obj = {};
	var val;
	for (var k in atts) {
		val = atts[k];
		if (val && val.default !== undefined) val = val.default;
		else if (typeof val != "string") val = null;
		obj[k] = {
			'default': val
		};
	}
	return obj;
}

function domSelector(tag, attrs) {
	var sel = tag.toLowerCase();
	var className = attrs.class;
	if (className) sel += "." + className.split(' ').join('.');
	return sel;
}

