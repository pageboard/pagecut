var commonAncestor = require('common-ancestor');
var State = require('prosemirror-state');

exports.define = define;
exports.attrToBlock = attrToBlock;
exports.blockToAttr = blockToAttr;
exports.nodeToContent = nodeToContent;

var index;

function define(view, elt, schema, views) {
	// ignore virtual elements
	if (!elt.render) return;
	var dom = view.render({
		type: elt.name,
		data: {},
		content: {}
	});
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

function findContent(dom) {
	if (dom.hasAttribute('block-content')) return dom;
	var contents = Array.from(dom.querySelectorAll('[block-content]'));
	if (!contents.length) return;
	return commonAncestor.apply(null, contents);
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
				blockToAttr(block),
				attrsFrom(dom)
			);
		}
	};

	parseRule.contentElement = findContent;

	var spec = {
		typeName: "root",
		inline: !!elt.inline,
		defining: !elt.inline,
		isolating: !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		toDOM: function(node) {
			// TODO consider node.marks[0].attrs.block_id as well
			var id = node.attrs.block_id;
			if (!id) {
				id = view.blocks.genId();
				var ublock = attrToBlock(node.attrs);
				ublock.id = id;
				node.attrs.block_id = id;
				view.blocks.set(ublock);
			}
			var block = view.blocks.get(id);
			var dom = view.render(block);
			var uView = flagDom(dom);
			return toDOMOutputSpec(uView, node);
		},
		nodeView: function(node, view, getPos, decorations) {
			return new RootNodeView(elt, obj.dom, node, view, getPos);
		}
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
		}
	};
	if (obj.contentDOM != obj.dom) {
		parseRule.contentElement = findContent;
	}

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
		}
	};
	parseRule.contentElement = findContent;


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
		block = attrToBlock(node.attrs);
		block.id = this.id;
		view.blocks.set(block);
	} else {
		block = view.blocks.get(this.id);
		if (!block) {
		} else if (block.deleted) {
			delete block.deleted;
		}
	}
	this.dom = domModel.cloneNode(true);
	this.contentDOM = findContent(this.dom);
	var contentName = this.contentDOM.getAttribute('block-content');
	if (contentName) {
		block.content[contentName] = this.contentDOM;
	}
	this.update(node);
}

RootNodeView.prototype.update = function(node, decorations) {
	var self = this;
	if (isNodeAttrsEqual(self.state, node.attrs)) return true;
	self.state = Object.assign({}, node.attrs);
	var block = this.view.blocks.get(this.id);
	if (!block) {
		return true;
	}

	if (node.attrs.block_focused) block.focused = node.attrs.block_focused;
	else delete block.focused;

	var uBlock = attrToBlock(node.attrs);

	Object.assign(block.data, uBlock.data);

	var dom = this.view.render(block);
	mutateNodeView(self, flagDom(dom));
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
	// always ignore mutation
	return true;
};

RootNodeView.prototype.destroy = function() {
	var block = this.view.blocks.get(this.id);
	if (block) block.deleted = true;
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
	var root = this.dom.closest('[block-type]');
	var id = root.getAttribute('block-id');
	var block = this.view.blocks.get(id);
	var contentName = node.attrs.block_content;
	block.content[contentName] = this.contentDOM;
	return true;
};

ContainerNodeView.prototype.ignoreMutation = function(record) {
	// never ignore mutation
	console.log("record", record);
	// TODO find parent block id, then block, then update block content
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
		// TODO maybe something gentler, depending on how often mutate is called
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
	block.content = {};
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

