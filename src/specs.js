var commonAncestor = require('@kapouer/common-ancestor');
var State = require('prosemirror-state');
var Model = require('prosemirror-model');

exports.define = define;

var index;

function define(view, elt, schema, views) {
	// ignore virtual elements
	if (!elt.render) return;
	var dom = view.render(view.blocks.create(elt.name));
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) {
		console.error(`ignoring ${elt.name} element - render does not return a DOM Node`);
		return;
	}
	if (dom.parentNode) dom = dom.cloneNode(true);
	var index = 0;

	var parent;

	flagDom(elt, dom, function(type, obj) {
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
		if (parent && type != "root") {
			spec.parseDOM[0].context = parent + '/';
		}
		parent = obj.name;
		if (obj.children.length) {
			// this type of node has content that is wrap or container type nodes
			spec.content = obj.children.map(function(child) {
				return child.name;
			}).join(" ");
		} else if (elt.contents) {
			if (typeof elt.contents != "string") {
				var contentName = (obj.contentDOM || obj.dom).getAttribute('block-content');
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
						var specStr = elt.contents[contentName];
						if (typeof specStr != "string" && specStr.spec) specStr = specStr.spec;
						spec.content = specStr;
					}
				}
			} else {
				if (!elt.inplace) console.error("contents can be a string spec only for inplace element", elt);
				else spec.content = elt.contents;
			}
		}

		if (spec.inline) {
			schema.marks = schema.marks.addToStart(obj.name, spec);
		} else {
			schema.nodes = schema.nodes.addToStart(obj.name, spec);
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

function findContent(elt, dom) {
	if (elt.inline || typeof elt.contents == "string") return dom;
	var list = [];
	getImmediateContents(dom, list);
	if (!list.length) return;
	return commonAncestor.apply(null, list);
}

function flagDom(elt, dom, iterate) {
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) return;
	var obj = {
		dom: dom,
		contentDOM: findContent(elt, dom)
	};
	if (!obj.children) obj.children = [];
	var wrapper = false;
	if (obj.contentDOM) {
		var child;
		for (var i=0; i < obj.contentDOM.childNodes.length; i++) {
			child = flagDom(elt, obj.contentDOM.childNodes[i], iterate);
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
		var attrs = domAttrsMap(dom);
		if (!obj.contentDOM || node instanceof Model.Mark) return [dom.nodeName, attrs];
		out = [dom.nodeName, attrs, out];
		if (dom == obj.dom) break;
		dom = dom.parentNode;
	}
	return out;
}

function createRootSpec(view, elt, obj) {
	var defaultAttrs = {
		block_id: null,
		block_focused: null,
		block_data: null,
		block_type: elt.name
	};

	var defaultSpecAttrs = specAttrs(defaultAttrs);
	if (elt.inline) obj.contentDOM = obj.dom;

	var parseRule = {
		getAttrs: function(dom) {
			var type = dom.getAttribute('block-type') || elt.name;
			var id = dom.getAttribute('block-id');
			var data = dom.getAttribute('block-data');
			var attrs = {
				block_type: type
			};
			if (data) {
				attrs.block_data = data;
			}
			if (elt.inplace) {
				if (elt.parse) attrs.block_data = JSON.stringify(elt.parse(dom));
				return attrs;
			}
			var block;
			if (id) block = view.blocks.get(id);
			if (!block) {
				block = view.blocks.fromAttrs(attrs);
				view.blocks.set(block);
			} else if (block.online) {
				delete block.id;
				view.blocks.set(block);
			}
			attrs = view.blocks.toAttrs(block);
			attrs.block_type = type;
			return attrs;
		},
		contentElement: function(dom) { return findContent(elt, dom); }
	};
	if (elt.context) parseRule.context = elt.context;

	if (elt.tag) {
		parseRule.tag = elt.tag;
	} else if (elt.inline) {
		parseRule.tag = domSelector(obj.dom.nodeName, {class: obj.className});
	} else {
		parseRule.tag = `[block-type="${elt.name}"]`;
	}

	var spec = {
		typeName: "root",
		inline: !!elt.inline,
		defining: obj.dom == obj.contentDOM,
		isolating: !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		toDOM: function(node) {
			var id = node.attrs.block_id;
			if (!id && node.marks && node.marks[0]) {
				id = node.marks[0].attrs.block_id;
				console.warn("Probably unsupported case of id from in node.marks", elt.inline, node);
			}
			var block;
			if (id) block = view.blocks.get(id);
			if (!block) block = view.blocks.fromAttrs(node.attrs);
			else block.focused = node.attrs.block_focused;

			var dom = view.render(block, node.attrs.block_type);
			var uView = flagDom(elt, dom);
			return toDOMOutputSpec(uView, node);
		}
	};
	if (obj.dom.childNodes.length || elt.contents) {
		// there's a bug somewhere (in prosemirror ?) with leaf nodes having a nodeView
		spec.nodeView = function(node, view, getPos, decorations) {
			return new RootNodeView(elt, obj.dom, node, view, getPos);
		};
		// explicitely allow dragging for nodes without contentDOM
		if (!obj.contentDOM) spec.draggable = true;
	} else {
		// this node does not have editable content
		spec.atom = true;
		// this makes prosemirror manage drag and drop for leaf nodes
		// without it, chrome allows dragging images - not as dom nodes but as data
		// and it screws our model
		spec.draggable = true;
	}
	if (elt.group) spec.group = elt.group;

	return spec;
}

function createWrapSpec(view, elt, obj) {
	var defaultAttrs = attrsFrom(obj.dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: domSelector(obj.dom.nodeName, defaultAttrs) + ':not([block-type])',
		getAttrs: function(dom) {
			return attrsFrom(dom);
		},
		contentElement: function(dom) { return findContent(elt, dom); }
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
	var defaultAttrs = attrsFrom(obj.dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: `${obj.dom.nodeName.toLowerCase()}[block-content="${defaultAttrs.block_content}"]:not([block-type])`,
		getAttrs: function(dom) {
			return attrsFrom(dom);
		},
		contentElement: function(dom) { return findContent(elt, dom); }
	};

	var spec = {
		typeName: "container",
		attrs: defaultSpecAttrs,
		defining: obj.dom == obj.contentDOM,
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

function RootNodeView(elt, domModel, node, view, getPos) {
	this.view = view;
	this.element = elt;
	this.domModel = domModel;
	this.id = node.attrs.block_id;
	var block;
	if (this.id) {
		if (elt.inplace) {
			delete node.attrs.block_id;
			delete this.id;
		} else {
			block = view.blocks.get(this.id);
			if (block && block.online) {
				// this block is already online - it's a split
				block = null;
			}
		}
	}
	if (!block) {
		delete node.attrs.block_id;
		delete this.id;
		block = view.blocks.fromAttrs(node.attrs);
	}
	if (!elt.inplace && !this.id) {
		this.id = block.id = node.attrs.block_id = view.blocks.genId();
		view.blocks.set(block);
	}

	this.mount(block);
	this.update(node);
}

RootNodeView.prototype.mount = function(block) {
	block.online = true;
	if (block.focused) delete block.focused;
	this.dom = this.domModel.cloneNode(true);
	this.contentDOM = findContent(this.element, this.dom);
	this.updateBlockContent(block);
};

RootNodeView.prototype.updateBlockContent = function(block) {
	if (!this.contentDOM) return;
	var elt = this.element;
	var contentName = this.contentDOM.getAttribute('block-content');
	if (!contentName && typeof elt.contents != "string") {
		var contentKeys = Object.keys(elt.contents);
		if (contentKeys.length == 1) contentName = contentKeys[0];
	}
	if (contentName) {
		block.content[contentName] = this.contentDOM;
	}
};

RootNodeView.prototype.update = function(node, decorations) {
	if (this.element.name != node.attrs.block_type) {
		return false;
	}
	var oldBlock = this.oldBlock;
	if (node.attrs.block_id != this.id) {
		return false;
	}
	var uBlock = this.view.blocks.fromAttrs(node.attrs);
	var block;
	if (this.element.inplace) {
		block = uBlock;
	} else {
		block = this.view.blocks.get(this.id);
		if (!block) {
			console.warn("block should exist", node);
			return true;
		}
		if (!block.online) {
			// the block has been auto-filled, but never
			// associated with a nodeView
			return false;
		}
	}

	Object.assign(block.data, uBlock.data);

	// consider it's the same data when it's initializing
	var sameData = oldBlock && this.view.utils.equal(oldBlock.data, block.data);
	var sameFocus = oldBlock && this.oldBlock.focused == node.attrs.block_focused;

	if (sameData && sameFocus) {
		// no point in calling render
		if (oldBlock && this.dom.update) {
			setTimeout(this.dom.update.bind(this.dom));
		}
		return true;
	}

	this.oldBlock = this.view.blocks.copy(block);
	this.oldBlock.content = {};
	this.oldBlock.focused = node.attrs.block_focused;

	if (node.attrs.block_focused) block.focused = node.attrs.block_focused;
	else delete block.focused;

	var dom = this.view.render(block, node.attrs.block_type);
	mutateNodeView(this, flagDom(this.element, dom), !oldBlock);
	if (oldBlock && this.dom.update) {
		this.dom.update();
	}
	return true;
};

RootNodeView.prototype.ignoreMutation = function(record) {
	if (record.target == this.contentDOM && record.type == "childList") {
		return false;
	} else {
		return true;
	}
};

RootNodeView.prototype.destroy = function() {
	var block = this.view.blocks.get(this.id);
	if (block) {
		delete block.online;
	}
};

function WrapNodeView(elt, domModel, node, view) {
	this.dom = domModel.cloneNode(true);
	this.contentDOM = findContent(elt, this.dom);
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

function ContainerNodeView(elt, domModel, node, view) {
	this.dom = domModel.cloneNode(true);
	this.element = elt;
	this.view = view;
	this.contentDOM = findContent(elt, this.dom);
}

ContainerNodeView.prototype.update = function(node, decorations) {
	// mergeNodeAttrsToDom(node.attrs, nodeView.dom);
	var root = this.dom.closest('[block-type]');
	if (root.getAttribute('block-type') != this.element.name) {
		return false;
	}
	var id = root.getAttribute('block-id');
	if (this.id && this.id != id) {
		return false;
	}
	this.id = id;
	var block = this.view.blocks.get(id);
	var contentName = node.attrs.block_content;
	block.content[contentName] = this.contentDOM;
	return true;
};

ContainerNodeView.prototype.ignoreMutation = function(record) {
	if (record.target == this.contentDOM && record.type == "childList") {
		return false;
	} else {
		return true;
	}
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
	var dom = obj.dom;
	if (nobj.dom.nodeName != dom.nodeName) {
		var emptyDom = dom.ownerDocument.createElement(nobj.dom.nodeName);
		if (dom.parentNode) {
			dom.parentNode.replaceChild(emptyDom, dom);
		}
		obj.dom = emptyDom;
		while (dom.firstChild) emptyDom.appendChild(dom.firstChild);
		obj.contentDOM = obj.dom;
	}
	// first upgrade attributes
	mutateAttributes(obj.dom, nobj.dom);
	// then upgrade descendants
	var parent, node;
	if (!obj.contentDOM) {
		// remove all elementRendered
		parent = obj.dom;
		node = parent.firstChild;
		var cur;
		while (node) {
			if (node.elementRendered || initial) {
				cur = node;
			} else {
				cur = null;
			}
			node = node.nextSibling;
			if (cur) parent.removeChild(cur);
		}
		node = nobj.dom.firstChild;
		while (node) {
			node.elementRendered = true;
			cur = node;
			node = node.nextSibling;
			parent.appendChild(cur);
		}
		return;
	} else if (obj.dom == obj.contentDOM) {
		// our job is done
		return;
	}
	// there is something between dom and contentDOM
	var cont = obj.contentDOM;
	var ncont = nobj.contentDOM;

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
	if (className) {
		sel += className.split(' ').filter(function(str) {
			return !!str;
		}).map(function(str) {
			return '.' + str;
		}).join('');
	}
	return sel;
}

