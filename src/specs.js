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
	if (dom.parentNode) throw new Error(`${elt.name} element must render an orphaned DOM Node`);
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
		contentDOM: dom
	};
	dom.setAttribute('contenteditable', 'false');
	var contents = [];
	if (dom.hasAttribute('block-content')) {
		contents.push(dom);
		dom.setAttribute('contenteditable', 'true');
	}	else {
		contents = Array.from(dom.querySelectorAll('[block-content]'));
	}

	if (contents.length == 0) {
		return; // ignore this
	}

	var anc = commonAncestor.apply(null, contents);
	if (anc != dom) {
		obj.contentDOM = anc;
		anc.setAttribute('block-ancestor', '');
	}

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
	var dom = obj.contentDOM;
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
			return Object.assign(
				blockToAttr(editor.resolve(dom)),
				attrsFrom(dom)
			);
		}
	};
	if (obj.contentDOM != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	var spec = {
		typeName: "root",
		inline: !!elt.inline,
		defining: !elt.inline,
		isolating: !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new RootNodeView(node, view, elt, obj.dom);
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
	if (obj.contentDOM != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	var spec = {
		typeName: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new WrapNodeView(node, view, elt, obj.dom);
		}
	};
	return spec;
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
	if (obj.contentDOM != obj.dom) {
		parseRule.contentElement = '[block-ancestor]';
	}

	var spec = {
		typeName: "container",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new ContainerNodeView(node, view, elt, obj.dom);
		}
	};
	return spec;
}

function RootNodeView(node, view, element, domModel) {
	this.dom = domModel.cloneNode(true);
	this.view = view;
	this.element = element;
	this.contentDOM = this.dom.querySelector('[block-ancestor]') || this.dom;
	this.update(node);
}

RootNodeView.prototype.update = function(node, decorations) {
	var self = this;
	if (isNodeAttrsEqual(self.state, node.attrs)) return true;
	self.state = Object.assign({}, node.attrs);
	var block = attrToBlock(node.attrs);
	var uView = flagDom(this.view.render(block));
	mutateNodeView(self, uView);
	uView.children.forEach(function(childView, i) {
		var child = node.child(i);
		child.uView = childView;
	});
	return true;
};

RootNodeView.prototype.stopEvent = function(e) {
	var tg = e.target;
	if (!tg.closest) tg = tg.parentNode;
	var handle = tg.closest('[draggable]');
	var ownHandle = this.dom.querySelector('[draggable]');
	if (handle && ownHandle && handle == ownHandle) {
		var tr = this.view.state.tr;
		tr = tr.setSelection(State.NodeSelection.create(tr.doc, getPos()));
		tr.setMeta('addToHistory', false);
		this.view.dispatch(tr);
	}
};

//RootNodeView.prototype.ignoreMutation = function(record) {
//	// TODO mutations can be used to update blocks contents ?
//	var node = record.target;
//	if (node.nodeType != 1 && node.parentNode) node = node.parentNode;
//	var content = node.closest('[block-content]');
//	if (content) {
//		console.log(content.outerHTML);
//	}
//	return false;
//};

function WrapNodeView(node, view, element, domModel) {
	this.dom = domModel.cloneNode(true);
	this.contentDOM = this.dom.querySelector('[block-ancestor]') || this.dom;
	this.update(node);
}

WrapNodeView.prototype.update = function(node, decorations) {
	if (node.uView) {
		mutateNodeView(this, node.uView);
		delete node.uView;
	}
	return true;
};

function ContainerNodeView(node, view, element, domModel) {
	this.dom = domModel.cloneNode(true);
	this.contentDOM = this.dom.querySelector('[block-ancestor]') || this.dom;
	this.update(node);
}

ContainerNodeView.prototype.update = function(node, decorations) {
	if (node.uView) {
		mutateNodeView(this, node.uView);
		delete node.uView;
	}
	// mergeNodeAttrsToDom(node.attrs, nodeView.dom);
	return true;
};

ContainerNodeView.prototype.ignoreMutation = function(record) {
	return true;
};

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
	if (obj.dom == obj.contentDOM) return; // our job is done
	// there is something between dom and contentDOM
	var cont = obj.contentDOM;
	var ncont = nobj.contentDOM;
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

function isNodeAttrsEqual(a, b) {
	if (!a || !b) return false;
	// nothing smart here, move along
	for (var j in a) {
		if (b[j] !== a[j]) return false;
	}
	for (var k in b) {
		if (a[k] !== b[k]) return false;
	}
	return true;
}

function blockToAttr(block) {
	var attrs = {};
	if (!block) return attrs;
	if (block.id != null) attrs.block_id = block.id;
	if (block.type != null) attrs.block_type = block.type;
	if (block.data) attrs.block_data = JSON.stringify(block.data);
	if (attrs.block_data == "{}") delete attrs.block_data;
	return attrs;
}

function attrToBlock(attrs) {
	var block = {};
	for (var name in attrs) {
		if (name.startsWith('block_')) block[name.substring(6)] = attrs[name];
	}
	if (block.data) block.data = JSON.parse(block.data);
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

