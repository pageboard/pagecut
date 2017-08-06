var commonAncestor = require('@kapouer/common-ancestor');
var State = require('prosemirror-state');
var Model = require('prosemirror-model');

exports.define = define;

var index;

function define(view, elt, schema, views) {
	// ignore virtual elements
	if (!elt.render) return;
	var dom = view.render(view.blocks.create(elt.name));
	if (!dom) throw new Error(`${elt.name} element must render a DOM Node`);
	if (dom.parentNode) dom = dom.cloneNode(true);
	var index = 0;

	flagDom(dom, function(type, obj) {
		var spec;
		if (type == "root") {
			spec = createRootSpec(view, elt, obj);
			obj.name = elt.name;
		} else if (type == "wrap") {
			spec = createWrapSpec(view, elt, obj);
		} else if (type == "container") {
			spec = createContainerSpec(view, elt, obj);
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
					console.warn(`element ${elt.name} cannot choose a default block-content among`, elt.contents, obj);
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

function getImmediateContents(root, list) {
	if (root.hasAttribute('block-content')) {
		list.push(root);
		return;
	}
	Array.prototype.forEach.call(root.childNodes, function(node) {
		if (node.nodeType == Node.ELEMENT_NODE) getImmediateContents(node, list);
	});
}

function findContent(dom) {
	var list = [];
	getImmediateContents(dom, list);
	if (!list.length) return;
	return commonAncestor.apply(null, list);
}

function flagDom(dom, iterate) {
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) return;
	var obj = {
		dom: dom,
		contentDOM: findContent(dom)
	};
	if (!obj.children) obj.children = [];
	var wrapper = false;
	if (obj.contentDOM) {
		var child;
		for (var i=0; i < obj.contentDOM.childNodes.length; i++) {
			child = flagDom(obj.contentDOM.childNodes[i], iterate);
			if (child) {
				obj.children.push(child);
				if (child.contentDOM) {
					wrapper = true;
				}
			}
		}
	}

	if (iterate) {
		if (!dom.parentNode) iterate('root', obj);
		else if (obj.contentDOM) {
			if (!wrapper) iterate('container', obj);
			else iterate('wrap', obj);
		}
	}
	return obj;
}

function toDOMOutputSpec(obj, node) {
	var out = 0;
	var dom = obj.contentDOM || obj.dom;
	while (dom) {
		var attrs = dom == obj.dom ? attrsTo(node.attrs) : domAttrsMap(dom);
		if (!obj.contentDOM || node instanceof Model.Mark) return [dom.nodeName, attrs];
		out = [dom.nodeName, attrs, out];
		if (dom == obj.dom) break;
		dom = dom.parentNode;
	}
	return out;
}

function createRootSpec(view, elt, obj) {
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
			var block = view.blocks.get(dom.getAttribute('block-id'));
			// it's ok to use dom attributes to rebuild a block
			return Object.assign(
				view.utils.blockToAttr(block),
				attrsFrom(dom)
			);
		},
		contentElement: findContent
	};

	var spec = {
		typeName: "root",
		inline: !!elt.inline,
		defining: !elt.inline,
		isolating: !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		toDOM: function(node) {
			var id = node.attrs.block_id;
			if (!id && node.marks && node.marks[0]) {
				id = node.marks[0].attrs.block_id;
				console.warn("Probably unsupported case of id from in node.marks", node);
			}
			if (!id) {
				id = view.blocks.genId();
				var ublock = view.utils.attrToBlock(node.attrs);
				ublock.id = id;
				node.attrs.block_id = id;
				view.blocks.set(ublock);
			}
			var block = view.blocks.get(id);
			var dom = view.render(block);
			var uView = flagDom(dom);
			return toDOMOutputSpec(uView, node);
		}
	};
	// there's a bug somewhere (in prosemirror ?) with leaf nodes having a nodeView
	if (obj.contentDOM) spec.nodeView = function(node, view, getPos, decorations) {
		return new RootNodeView(elt, obj.dom, node, view, getPos);
	};
	if (elt.group) spec.group = elt.group;

	return spec;
}

function createWrapSpec(view, elt, obj) {
	var defaultAttrs = Object.assign({
		// TODO
	}, attrsFrom(obj.dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: domSelector(obj.dom.nodeName, defaultAttrs),
		getAttrs: function(dom) {
			return attrsFrom(dom);
		},
		contentElement: findContent
	};

	var spec = {
		typeName: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new WrapNodeView(elt, obj.dom, node, view);
		}
	};
	return spec;
}

function createContainerSpec(view, elt, obj) {
	var defaultAttrs = Object.assign({
		// TODO
	}, attrsFrom(obj.dom));
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: `${obj.dom.nodeName}[block-content="${defaultAttrs.block_content}"]`,
		getAttrs: function(dom) {
			return attrsFrom(dom);
		},
		contentElement: findContent
	};

	var spec = {
		typeName: "container",
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new ContainerNodeView(elt, obj.dom, node, view);
		}
	};
	return spec;
}

function RootNodeView(element, domModel, node, view, getPos) {
	this.element = element;
	this.view = view;
	this.getPos = getPos;
	this.id = node.attrs.block_id;
	var block;
	if (!this.id) {
		this.id = view.blocks.genId();
		node.attrs.block_id = this.id;
		block = view.utils.attrToBlock(node.attrs);
		block.id = this.id;
		view.blocks.set(block);
	} else {
		block = view.blocks.get(this.id);
		if (!block) {
			console.warn("missing block", node.attrs);
		} else if (block.deleted) {
			delete block.deleted;
		}
	}
	this.dom = domModel.cloneNode(true);
	this.contentDOM = findContent(this.dom);
	if (this.contentDOM) {
		var contentName = this.contentDOM.getAttribute('block-content');
		if (contentName) {
			block.content[contentName] = this.contentDOM;
		}
	}
	this.update(node);
}

RootNodeView.prototype.update = function(node, decorations) {
	var self = this;
	var initial = !self.state;
	var uBlock = attrToBlock(node.attrs);
	var block = this.view.blocks.get(this.id);
	if (!block) {
		return true;
	}

	var oBlock = this.view.blocks.copy(block);
	oBlock.content = {};
	self.state = oBlock;

	if (!initial && this.element.update) {
		this.element.update(this.dom, block);
	}

	if (this.view.utils.equal(self.state, uBlock)) {
		return true;
	}

	if (node.attrs.block_focused) block.focused = node.attrs.block_focused;
	else delete block.focused;

	Object.assign(block.data, uBlock.data);

	var dom = this.view.render(block);
	mutateNodeView(self, flagDom(dom), initial);
	return true;
};

RootNodeView.prototype.stopEvent = function(e) {
	var tg = e.target;
	if (!tg.closest) tg = tg.parentNode;
	var handle = tg.closest('[draggable]');
	var ownHandle = this.dom.querySelector('[draggable]');
	if (handle && ownHandle && handle == ownHandle) {
		var tr = this.view.state.tr;
		tr = tr.setSelection(State.NodeSelection.create(tr.doc, this.getPos()));
		tr.setMeta('addToHistory', false);
		this.view.dispatch(tr);
	}
};

RootNodeView.prototype.ignoreMutation = function(record) {
	return true;
};

RootNodeView.prototype.destroy = function() {
	var block = this.view.blocks.get(this.id);
	if (block) block.deleted = true;
};

function WrapNodeView(element, domModel, node, view) {
	this.dom = domModel.cloneNode(true);
	this.contentDOM = findContent(this.dom);
	this.update(node);
}

WrapNodeView.prototype.update = function(node, decorations) {
	if (node.uView) {
		mutateNodeView(this, node.uView);
		delete node.uView;
	}
	return true;
};

WrapNodeView.prototype.ignoreMutation = function(record) {
	// always ignore mutation
	return true;
};

function ContainerNodeView(element, domModel, node, view) {
	this.dom = domModel.cloneNode(true);
	this.view = view;
	this.contentDOM = findContent(this.dom);
}

ContainerNodeView.prototype.update = function(node, decorations) {
	// mergeNodeAttrsToDom(node.attrs, nodeView.dom);
	if (this.id) return true;
	var root = this.dom.closest('[block-type]');
	var id = root.getAttribute('block-id');
	if (!id) return true;
	this.id = id;
	var block = this.view.blocks.get(id);
	var contentName = node.attrs.block_content;
	block.content[contentName] = this.contentDOM;
	return true;
};

ContainerNodeView.prototype.ignoreMutation = function(record) {
	// never ignore mutation
	return false;
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

function mutateNodeView(obj, nobj, initial) {
	// first upgrade attributes
	mutateAttributes(obj.dom, nobj.dom);
	// then upgrade descendants
	if (!obj.contentDOM || obj.dom == obj.contentDOM) return; // our job is done
	// there is something between dom and contentDOM
	var cont = obj.contentDOM;
	var ncont = nobj.contentDOM;
	var parent, node;

	// replace only nodes rendered by element
	while (cont != obj.dom) {
		mutateAttributes(cont, ncont);
		parent = cont.parentNode;
		node = cont;
		while (node.previousSibling) {
			if (node.previousSibling.elementRendered || initial) parent.removeChild(node.previousSibling);
			else node = node.previousSibling;
		}
		node = cont;
		while (node.nextSibling) {
			if (node.nextSibling.elementRendered || initial) parent.removeChild(node.nextSibling);
			else node = node.nextSibling;
		}
		node = ncont;
		while (node.previousSibling) {
			node.previousSibling.elementRendered = true;
			parent.insertBefore(node.previousSibling, cont);
		}
		node = ncont;
		while (node.nextSibling) {
			node.nextSibling.elementRendered = true;
			parent.appendChild(node.nextSibling);
		}
		cont = parent;
		ncont = ncont.parentNode;
	}
}

function mutateAttributes(dom, ndom) {
	// TODO remove only spec-defined attributes that are not in ndom
	var attr;
	var natts = ndom.attributes;
	for (var k=0; k < natts.length; k++) {
		attr = natts[k];
		dom.setAttribute(attr.name, ndom.getAttribute(attr.name));
	}
	var atts = dom.attributes;
	for (var j=0; j < atts.length; j++) {
		attr = atts[j]
		if (attr.name.startsWith('block-') && !ndom.hasAttribute(attr.name)) dom.removeAttribute(attr.name);
	}
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
	for (var k in attrs) if (attrs[k] != null) domAttrs[k.replace(/_/g, '-')] = attrs[k];
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
		obj[k] = {};
		obj[k].default = val && val.default || val;
	}
	return obj;
}

function domSelector(tag, attrs) {
	var sel = tag.toLowerCase();
	var className = attrs.class;
	if (className) sel += "." + className.split(' ').join('.');
	return sel;
}

