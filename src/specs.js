var commonAncestor = require('common-ancestor');
exports.define = define;
exports.attrToBlock = attrToBlock;
exports.blockToAttr = blockToAttr;
exports.nodeToContent = nodeToContent;

var index;

function define(editor, elt, schema, views) {
	// ignore virtual elements
	if (!elt.view) return;
	var dom = elt.view(editor.doc, {
		type: elt.name,
		data: {},
		content: {}
	}, editor);
	if (!dom) throw new Error(`${elt.name} element must render a DOM Node`);
	var index = 0;
	flagDom(dom, function(type, obj) {
		var spec;
		if (type == "root") {
			spec = createRootSpec(editor, elt, obj);
			obj.name = elt.name;
		} else if (type == "wrap") {
			spec = createWrapSpec(editor, elt, obj);
		} else if (type == "container") {
			spec = createContainerSpec(editor, elt, obj);
		}
		if (!obj.name) obj.name = `${elt.name}_${type}_${index++}`;
		if (obj.children.length) {
			// this type of node has content that is wrap or container type nodes
			spec.content = obj.children.map(function(child) {
				return child.name;
			}).join(" ");
		} else if (elt.contents) {
			var contentName = obj.dom.getAttribute('block-content');
			if (!contentName) {
				var specKeys = Object.keys(elt.contents);
				if (specKeys.length == 1) {
					contentName = specKeys[0];
				} else if (specKeys.length > 1) {
					console.warn(`element ${elt.name} cannot choose a default block-content among`, elt.contents);
					return;
				}
			}
			if (contentName) {
				if (!elt.contents[contentName]) {
					console.warn(`element ${elt.name} has no matching contents`, contentName);
					return;
				} else {
					spec.content = elt.contents[contentName].spec;
				}
			}
		}

		if (spec.inline) {
			schema.marks = schema.marks.addToEnd(obj.name, spec);
		} else {
			schema.nodes = schema.nodes.addToEnd(obj.name, spec);
		}
		if (spec.nodeView) {
			views[obj.name] = spec.nodeView;
		}
	});
}

function flagDom(dom, iterate) {
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) return;
	var obj = {
		dom: dom,
		contentDom: dom
	};
	dom.setAttribute('contenteditable', 'false');
	var contents = [];
	if (dom.hasAttribute('block-content')) contents.push(dom);
	else contents = Array.from(dom.querySelectorAll('[block-content]'));

	if (contents.length == 0) return; // ignore this

	var anc = commonAncestor.apply(null, contents);
	if (anc != dom) {
		obj.contentDom = anc;
		anc.setAttribute('block-ancestor', '');
		var cur = anc;
		while (cur = cur.previousSibling) {
			if (cur.nodeType == Node.ELEMENT_NODE) cur.setAttribute('contenteditable', 'false');
		}
		cur = anc;
		while (cur = cur.nextSibling) {
			if (cur.nodeType == Node.ELEMENT_NODE) cur.setAttribute('contenteditable', 'false');
		}
	}
	obj.contentDom.setAttribute('contenteditable', 'true');

	if (!obj.children) obj.children = [];
	var child;
	for (var i=0; i < anc.childNodes.length; i++) {
		child = flagDom(anc.childNodes[i], iterate);
		if (child) obj.children.push(child);
	}
	if (iterate) {
		if (!dom.parentNode) iterate('root', obj);
		else if (contents.length == 1) iterate('container', obj);
		else iterate('wrap', obj);
	}
	return obj;
}

function toDOMOutputSpec(obj, node) {
	var out = 0;
	var dom = obj.contentDom;
	var isLeaf = node.type.isLeaf;
	while (dom) {
		var attrs = dom == obj.dom ? attrsTo(node.attrs) : domAttrsMap(dom);
		if (isLeaf) return [dom.nodeName, attrs];
		out = [dom.nodeName, attrs, out];
		if (dom == obj.dom) break;
		dom = dom.parentNode;
	}
	return out;
}

function createRootSpec(editor, elt, obj) {
	var defaultAttrs = Object.assign({
		block_id: null,
		block_focused: null,
		block_type: elt.name,
		block_data: null
	}, attrsFrom(obj.dom));

	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: `[block-type="${elt.name}"]`,
		getAttrs: function(dom) {
			var block = editor.resolve(dom);
			if (block.type == "id") {
				block = null;
				console.error("Fix id module");
			}
			var attrs = attrsFrom(dom);
			return Object.assign(block ? blockToAttr(block) : {}, attrs);
		}
	};
	if (obj.contentDom != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	var spec = {
		typeName: "root",
		inline: !!elt.inline,
		defining: !elt.inline,
		isolating: !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		nodeView: createRootNodeView(elt, obj.dom),
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		}
	};
	if (elt.group) spec.group = elt.group;

	return spec;
}

function createWrapSpec(editor, elt, obj) {
	var defaultAttrs = Object.assign({
		// TODO
	}, attrsFrom(obj.dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: domSelector(obj.dom.nodeName, defaultAttrs),
		getAttrs: function(dom) {
			return attrsFrom(dom);
		}
	};
	if (obj.contentDom != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	return {
		typeName: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		nodeView: createWrapNodeView(elt, obj.dom),
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		}
	};
}

function createContainerSpec(editor, elt, obj) {
	var defaultAttrs = Object.assign({
		// TODO
	}, attrsFrom(obj.dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: `${obj.dom.nodeName}[block-content="${defaultAttrs.block_content}"]`,
		getAttrs: function(dom) {
			return attrsFrom(dom);
		}
	};
	if (obj.contentDom != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	return {
		typeName: "container",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		nodeView: createContainerNodeView(elt, obj.dom),
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		}
	};
}

function createRootNodeView(element, initialDom) {
	return function rootNodeView(node, view, getPos, decorations) {
		var nodeView = {};

		nodeView.dom = initialDom.cloneNode(true);
		nodeView.contentDom = nodeView.dom.querySelector('[block-ancestor]') || nodeView.dom;


		nodeView.update = function(node, decorations) {
			var uView = flagDom(nodeToDom(element, node, view));
			// nodeView.dom, nodeView.contentDom must not change
			mutateNodeView(nodeView, uView);
			// nodeView.contentDom.childNodes match nodeView.children[i].dom
			nodeView.contentDom._pagecut_nodeView_children = uView.children;
			return true;
		};

		nodeView.ignoreMutation = function(record) {
			return true;
		};
		return nodeView;
	};
}

function createWrapNodeView(element, initialDom) {
	return function wrapNodeView(node, view, getPos, decorations) {
		// TODO
		// problème: comment obtenir le DOM créé lors de rootNodeView à partir de ce node ?
		// - soit le node est "neuf" - et une simple copie de dom suffit - il faut juste
		// retrouver contentDom à partir de dom, ce qui peut être fait facilement
		// parce que contentDom a obtenu un attribut lors de la construction des specs
		// - soit le node est "parsé" - et node.attrs.viewId permet de retrouver
		// le dom/contentDom qui ont été créés par le rendu du root node

		var nodeView = {};
		nodeView.dom = initialDom.cloneNode(true);
		nodeView.contentDom = nodeView.dom.querySelector('[block-ancestor]') || nodeView.dom;

		nodeView.update = function(node, decorations) {
			// the nice thing here is that it just has to update to the "new" dom node
			var uView = nodeView.dom.nodeView;
			if (uView) {
				delete nodeView.dom.nodeView;
				mutateNodeView(nodeView, uView);
			}
			mergeNodeAttrsToDom(node.attrs, nodeView.dom);
			return true;
		};

		nodeView.ignoreMutation = function(record) {
			return true;
		};
		return nodeView;
	};
}

function createContainerNodeView(element, initialDom) {
	return function containerNodeView(node, view, getPos, decorations) {
		var nodeView = {};
		nodeView.dom = initialDom.cloneNode(true);
		nodeView.contentDom = nodeView.dom.querySelector('[block-ancestor]') || nodeView.dom;

		nodeView.update = function(node, decorations) {
			// the nice thing here is that it just has to update to the "new" dom node
			var uView = nodeView.dom.nodeView;
			if (uView) {
				delete nodeView.dom.nodeView;
				mutateNodeView(nodeView, uView);
			}
			mergeNodeAttrsToDom(node.attrs, nodeView.dom);
			return true;
		};

		nodeView.ignoreMutation = function(record) {
			return true;
		};
		return nodeView;
	};
}

function nodeToDom(element, node, view) {
	var block = attrToBlock(node.attrs);
	block.content = {};
	// this is a root node, so the new dom comes from a rendered block
	var dom = element.view(view.doc, block, view);
	if (!dom) throw new Error(`${element.name} element must render a DOM Node`);
	if (dom.nodeType != Node.ELEMENT_NODE) {
		console.error("I don't know what to do if element.view() doesn't return an element_node");
		return;
	}
	for (var i=0; i < view.modifiers.length; i++) {
		dom = view.modifiers[i](view, block, dom) || dom;
	}
	Object.assign(node.attrs, blockToAttr(block));
	mergeNodeAttrsToDom(node.attrs, dom);
	return dom;
}

function mergeNodeAttrsToDom(attrs, dom) {
	var domAttrs = attrsTo(Object.assign(
		{},
		attrs,
		attrsFrom(dom)
	));
	for (var k in domAttrs) {
		dom.setAttribute(k, domAttrs[k]);
	}
}

function mutateNodeView(obj, nobj) {
	// first upgrade attributes
	mutateAttributes(obj.dom, nobj.dom);
	// then upgrade descendants
	if (obj.dom == obj.contentDom) return; // our job is done
	// there is something between dom and contentDom
	var cont = obj.contentDom;
	var ncont = nobj.contentDom;
	var parent;
	while (cont != obj.dom) {
		mutateAttributes(cont, ncont);
		parent = cont.parentNode;
		while (cont.previousSibling) parent.removeChild(cont.previousSibling);
		while (cont.nextSibling) parent.removeChild(cont.nextSibling);
		while (ncont.previousSibling) parent.insertBefore(ncont.previousSibling, cont);
		while (ncont.nextSibling) parent.appendChild(ncont.nextSibling);
		cont = parent;
		ncont = ncont.parentNode;
	}
}

function mutateAttributes(dom, ndom) {
	var oldMap = domAttrsMap(dom);
	var natts = ndom.attributes;
	var attr, oldVal;
	for (var k=0; k < natts.length; k++) {
		attr = natts[k];
		oldVal = oldMap[attr.name];
		if (oldVal != null) {
			delete oldMap[attr.name];
		}
		if (oldVal != attr.value) dom.setAttribute(attr.name, attr.value);
	}
	for (var name in oldMap) dom.removeAttribute(name);
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

	if (type == "container") {
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

function domAttrsMap(dom) {
	var map = {};
	var atts = dom.attributes;
	for (var k=0; k < atts.length; k++) {
		map[atts[k].name] = atts[k].value;
	}
	return map;
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

