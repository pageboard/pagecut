var commonAncestor = require('@kapouer/common-ancestor');
var State = require('prosemirror-state');
var Model = require('prosemirror-model');
var DiffDOM = require('diff-dom');

var differ = new DiffDOM({
	preDiffApply: function(info) {
		if (/Attribute$/.test(info.diff.action) && info.diff.name == "block-focused") {
			return true;
		}
	}
});

exports.define = define;

var index;
var tags = {};

function define(view, elt, schema, views) {
	if (!elt.render) return; // some elements are not meant to be rendered
	var dom = view.render(view.blocks.create(elt.name));
	if (!dom || dom.nodeType != Node.ELEMENT_NODE) {
		console.error(`ignoring ${elt.name} element - render does not return a DOM Node`);
		return;
	}
	if (dom.parentNode) dom = dom.cloneNode(true);
	var index = 0;

	flagDom(elt, dom, function(type, obj) {
		var spec;
		if (type == "root") {
			spec = createRootSpec(view, elt, obj);
			obj.name = elt.name; // wrap and container are set further
		} else if (type == "wrap") {
			spec = createWrapSpec(view, elt, obj);
		} else if (type == "container") {
			spec = createContainerSpec(view, elt, obj);
		} else {
			throw new Error("Missing type in flagDom iterator", type, obj);
		}

		if (obj.children && obj.children.length) {
			// this type of node has content that is wrap or container type nodes
			spec.content = obj.children.map(function(child) {
				if (!child.name) console.warn(obj, "has no name for child", child);
				return child.name;
			}).join(" ");
		} else if (elt.contents) {
			var contentName = (obj.contentDOM || obj.dom).getAttribute('block-content');
			var contents = elt.contents;
			if (typeof contents != "string") {
				if (!contentName) {
					var contentKeys = Object.keys(contents);
					if (contentKeys.length == 1) {
						contentName = contentKeys[0];
					} else if (contentKeys.length > 1) {
						console.warn(`element ${elt.name} has no sane default block-content`, contents, obj);
						return;
					}
				}
				if (contentName) {
					var contentSpec = contents[contentName];
					if (!contentSpec) {
						console.warn(`element ${elt.name} has no matching contents`, contentName);
						return;
					} else {
						spec.contentName = contentName;
						if (typeof contentSpec != "string") {
							if (contentSpec.spec) {
								contentSpec = contentSpec.spec;
							} else {
								console.warn(`element ${elt.name} has bad definition for content ${contentName}`);
								return;
							}
						}
						spec.content = contentSpec;
					}
				}
			} else {
				if (!elt.inplace) {
					console.error("contents can be a string spec only for inplace element", elt);
				} else {
					spec.content = contents;
				}
			}
		}
		if (!obj.name) {
			obj.name = `${elt.name}_${type}_${spec.contentName || index++}`;
		}

		var parseTag = spec.parseDOM && spec.parseDOM[0].tag;
		if (parseTag) {
			var parseTagKey = spec.typeName == "root" ? parseTag : `${elt.name}_${parseTag}`;
			var oldName = tags[parseTagKey];
			if (oldName) {
				console.info(`Two elements with same tag "${parseTag}" - ${oldName} and ${obj.name}`);
			} else {
				tags[parseTagKey] = obj.name;
			}
		}

		if (type == "root") {
			var existingName = elt.replaces || elt.name;
			if (elt.inline) {
				if (schema.marks.get(existingName)) {
					schema.marks = schema.marks.remove(existingName);
				}
			} else {
				if (schema.nodes.get(existingName)) {
					schema.nodes = schema.nodes.remove(existingName);
				}
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
	if (!dom) return;
	if (dom.nodeType == Node.TEXT_NODE) {
		return {text: dom.nodeValue};
	}
	if (dom.nodeType != Node.ELEMENT_NODE) return;
	var obj = {
		dom: dom,
		contentDOM: findContent(elt, dom)
	};
	if (!obj.children) obj.children = [];
	var wrapper = false;
	if (obj.contentDOM) {
		var child;
		var childCount = obj.contentDOM.childNodes.length;
		for (var i=0; i < childCount; i++) {
			child = flagDom(elt, obj.contentDOM.childNodes[i], iterate, obj);
			if (!child) continue;
			if (child.text) {
				if (childCount == 1) {
					obj.defaultText = child.text;
				}
			}	else {
				obj.children.push(child);
				if (child.contentDOM) {
					wrapper = true;
				}
			}
		}
	}

	if (iterate) {
		if (!dom.parentNode) {
			iterate('root', obj);
		} else if (obj.contentDOM) {
			if (!wrapper) iterate('container', obj);
			else iterate('wrap', obj);
		}
	}
	return obj;
}

function toDOMOutputSpec(obj, node) {
	var out = 0;
	var dom = obj.contentDOM || obj.dom;
	var first = true;
	while (dom) {
		var attrs = domAttrsMap(dom);
		if (first) for (var k in node.attrs) attrs[k] = node.attrs[k];
		if (!obj.contentDOM || node instanceof Model.Mark) return [dom.nodeName, attrs];
		out = [dom.nodeName, attrs, out];
		if (dom == obj.dom) break;
		first = false;
		dom = dom.parentNode;
	}
	return out;
}

function createRootSpec(view, elt, obj) {
	var defaultAttrs = {
		block_id: null,
		block_focused: null,
		block_data: null,
		block_type: elt.name,
		block_standalone: elt.standalone ? "true" : null,
		default_text: obj.defaultText || null
	};

	var defaultSpecAttrs = specAttrs(defaultAttrs);
	if (elt.inline) obj.contentDOM = obj.dom;

	var parseRule = {
		getAttrs: function(dom) {
			var type = dom.getAttribute('block-type') || elt.name;
			var id = dom.getAttribute('block-id');
			var standalone = dom.getAttribute('block-standalone') == "true";
			var data = dom.getAttribute('block-data');
			var attrs = {
				block_type: type
			};
			if (data) {
				attrs.block_data = data;
			} else if (elt.parse) {
				attrs.block_data = JSON.stringify(elt.parse(dom));
			}
			if (elt.inplace) {
				return attrs;
			}
			var block;
			if (id) block = view.blocks.get(id);
			if (!block) {
				block = view.blocks.fromAttrs(attrs);
				if (standalone) {
					if (!id) {
						console.warn("standalone block missing id", dom.outerHTML);
					} else {
						block.id = id;
						block.standalone = true;
					}
				} else if (dom.closest('[block-standalone="true"]')) {
					block.id = id;
				} else {
					// attrs does not contain block_id so it's like setting a new id
				}
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
	} else if (elt.inplace) {
		parseRule.tag = domSelector(obj.dom.nodeName, {class: obj.dom.className});
	} else {
		parseRule.tag = `[block-type="${elt.name}"]`;
	}

	var spec = {
		typeName: "root",
		element: elt,
		domModel: obj.dom,
		inline: !!elt.inline,
		defining: obj.dom == obj.contentDOM,
		isolating: elt.isolating !== undefined ? elt.isolating : !elt.inline,
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
	if (elt.marks) spec.marks = elt.marks;
	if (!elt.inline || !elt.inplace) spec.nodeView = RootNodeView;
	// explicitely allow dragging for nodes without contentDOM
	if (!obj.contentDOM) {
		spec.draggable = true;
		spec.atom = true;
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
		element: elt,
		domModel: obj.dom,
		attrs: defaultSpecAttrs,
		parseDOM: [parseRule],
		defining: obj.dom == obj.contentDOM,
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: WrapNodeView
	};
	return spec;
}

function createContainerSpec(view, elt, obj) {
	var defaultAttrs = attrsFrom(obj.dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);
	var tag;
	if (obj.dom == obj.contentDOM) {
		tag = `${obj.dom.nodeName.toLowerCase()}[block-content="${defaultAttrs.block_content}"]`;
	} else {
		tag = domSelector(obj.dom.nodeName, defaultAttrs);
	}
	var parseRule = {
		tag: tag + ':not([block-type])',
		getAttrs: function(dom) {
			return attrsFrom(dom);
		},
		contentElement: function(dom) { return findContent(elt, dom); }
	};

	var spec = {
		typeName: "container",
		element: elt,
		domModel: obj.dom,
		attrs: defaultSpecAttrs,
		defining: obj.dom == obj.contentDOM,
		parseDOM: [parseRule],
		toDOM: function(node) {
			return toDOMOutputSpec(obj, node);
		},
		nodeView: ContainerNodeView
	};
	return spec;
}

function setupView(me) {
	me.dom = me.domModel.cloneNode(true);
	me.contentDOM = findContent(me.element, me.dom);
}

function RootNodeView(node, view, getPos, decorations) {
	if (!(this instanceof RootNodeView)) {
		return new RootNodeView(node, view, getPos, decorations);
	}
	this.view = view;
	this.element = node.type.spec.element;
	this.domModel = node.type.spec.domModel;
	this.getPos = getPos;
	this.id = node.attrs.block_id;
	var block;
	if (this.id) {
		if (this.element.inplace) {
			delete node.attrs.block_id;
			delete this.id;
		} else {
			block = view.blocks.get(this.id);
		}
	}
	if (!block) {
		if (node.attrs.block_id) {
			delete node.attrs.block_id;
			delete this.id;
		}
		block = view.blocks.fromAttrs(node.attrs);
	}
	if (!this.element.inplace && !this.id) {
		this.id = block.id = node.attrs.block_id = view.blocks.genId();
		view.blocks.set(block);
	}

	if (block.focused) delete block.focused;

	setupView(this);
	if (node.forEach) node.forEach(function(child) {
		if (child.type.spec.typeName == "container" || child.type.spec.typeName == "wrap") {
			child.blockId = this.id;
		}
	}.bind(this));
	this.update(node);
}

RootNodeView.prototype.selectNode = function() {
	this.selected = true;
	this.dom.classList.add('ProseMirror-selectednode');
};

RootNodeView.prototype.deselectNode = function() {
	this.selected = false;
	this.dom.classList.remove('ProseMirror-selectednode');
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
	}

	Object.assign(block.data, uBlock.data);

	// consider it's the same data when it's initializing
	var sameData = oldBlock && this.view.utils.equal(oldBlock.data, block.data);
	var sameFocus = oldBlock && this.oldBlock.focused == node.attrs.block_focused;

	if (!sameData || !sameFocus) {
		this.oldBlock = this.view.blocks.copy(block);
		this.oldBlock.focused = node.attrs.block_focused;

		if (node.attrs.block_focused) block.focused = node.attrs.block_focused;
		else delete block.focused;

		var dom = this.view.render(block, node.attrs.block_type);
		mutateNodeView(node, this, flagDom(this.element, dom), !oldBlock);
		if (this.selected) {
			this.selectNode();
		}
		if (oldBlock && this.dom.update) {
			// tell custom elements the editor updates this dom node
			setTimeout(this.dom.update.bind(this.dom), 30);
		}
	} else {
		// no point in calling render
	}

	var cname = node.type.spec.contentName;
	if (cname) {
		var cdom = this.contentDOM;
		if (!block.content) block.content = {};
		if (block.standalone && oldBlock) {
			if (!Array.isArray(block.content[cname])) {
				block.content[cname] = [];
			}
			var found = false;
			block.content[cname].forEach(function(idom) {
				if (idom == cdom) {
					found = true;
				} else {
					differ.apply(idom, differ.diff(idom, cdom));
				}
			});
			if (!found) {
				block.content[cname].push(cdom);
			}
		} else {
			if (block.content[cname] != cdom) {
				block.content[cname] = cdom;
			}
		}
	}

	return true;
};

RootNodeView.prototype.ignoreMutation = function(record) {
	if (record.target == this.contentDOM && record.type == "childList") {
		return false;
	} else if (record.target == this.dom && record.type == "attributes" && record.attributeName && record.attributeName.startsWith('data-')) {
		var block = this.view.blocks.get(this.id);
		if (!block) return true;

		var dataWhat = record.attributeName.split('-').slice(1).map(function(str, i) {
			if (i == 0) return str;
			return str[0].toUpperCase() + str.substring(1);
		}).join('');
		var prop = this.element.properties && this.element.properties[dataWhat];
		if (!prop) return true;

		var val = record.target.getAttribute(record.attributeName);
		if (prop.type == "boolean") {
			if (val == "true") val = true;
			else if (val == "false") val = false;
		} else if (prop.type == "integer") {
			val = parseInt(val);
		} else if (prop.type == "number") {
			val = parseFloat(val);
		} else if (prop.type == "string") {
			// nothing to do
		} else {
			console.warn("TODO support the type of that property", prop);
		}
		if (block.data[dataWhat] === val) return true;
		block.data[dataWhat] = val;
		var pos = this.getPos();
		var attrs = this.view.blocks.toAttrs(block);
		attrs.block_type = this.element.name;
		var tr = this.view.state.tr;
		var reselect = tr.selection.node && tr.selection.from == pos;
		tr.setNodeMarkup(pos, null, attrs);
		if (reselect) {
			tr.setSelection(State.NodeSelection.create(tr.doc, pos));
		}
		this.view.dispatch(tr);
		return true;
	} else {
		return true;
	}
};

function WrapNodeView(node, view, getPos, decorations) {
	if (!(this instanceof WrapNodeView)) {
		return new WrapNodeView(node, view, getPos, decorations);
	}
	this.element = node.type.spec.element;
	this.domModel = node.type.spec.domModel;
	setupView(this);
	this.update(node);
}

WrapNodeView.prototype.update = function(node, decorations) {
	var updatedAttrs = attrsTo(node.attrs);
	for (var k in updatedAttrs) {
		this.dom.setAttribute(k, updatedAttrs[k]);
	}
	return true;
};

WrapNodeView.prototype.ignoreMutation = function(record) {
	// always ignore mutation
	return true;
};

function ContainerNodeView(node, view, getPos, decorations) {
	if (!(this instanceof ContainerNodeView)) {
		return new ContainerNodeView(node, view, getPos, decorations);
	}
	this.view = view;
	this.element = node.type.spec.element;
	this.domModel = node.type.spec.domModel;
	if (node.blockId) {
		this.id = node.blockId;
	}
	setupView(this);
	this.update(node);
}

ContainerNodeView.prototype.update = function(node, decorations) {
	var block = this.view.blocks.get(this.id);
	if (!block) {
		console.warn("container has no root node id", this, node);
		return false;
	}
	var updatedAttrs = attrsTo(node.attrs);
	for (var k in updatedAttrs) {
		this.dom.setAttribute(k, updatedAttrs[k]);
	}
	if (node.type.spec.contentName) {
		if (!block.content) block.content = {};
		if (block.content[node.type.spec.contentName] != this.contentDOM) {
			block.content[node.type.spec.contentName] = this.contentDOM;
		}
	}
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

function mutateNodeView(pmNode, obj, nobj, initial) {
	var dom = obj.dom;
	if (nobj.dom.nodeName != dom.nodeName) {
		var emptyDom = dom.ownerDocument.createElement(nobj.dom.nodeName);
		if (dom.parentNode) {
			// workaround: nodeView cannot change their dom node
			var desc = emptyDom.pmViewDesc = dom.pmViewDesc;
			desc.nodeDOM = desc.contentDOM = desc.dom = emptyDom;
			dom.parentNode.replaceChild(emptyDom, dom);
		}
		obj.dom = emptyDom;
		while (dom.firstChild) emptyDom.appendChild(dom.firstChild);
		obj.contentDOM = obj.dom;
	}
	if (nobj.children.length) {
			// TODO use getPos() and tr.setNodeMarkup(pos, null, attrs) ?
		nobj.children.forEach(function(childObj, i) {
			var pmChild = pmNode.child(i);
			var viewDom = Array.prototype.find.call(obj.contentDOM.childNodes, function(child, i) {
				return child.pmViewDesc && child.pmViewDesc.node == pmChild;
			});
			if (viewDom) {
				mutateNodeView(pmChild, viewDom.pmViewDesc, childObj, initial);
			}
		}, this);
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
			if (node.previousSibling.elementRendered || initial) {
				parent.removeChild(node.previousSibling);
			} else {
				node = node.previousSibling;
			}
		}
		node = cont;
		while (node.nextSibling) {
			if (node.nextSibling.elementRendered || initial) {
				parent.removeChild(node.nextSibling);
			} else {
				node = node.nextSibling;
			}
		}
		while ((node = ncont.parentNode.firstChild) != ncont) {
			node.elementRendered = true;
			parent.insertBefore(node, cont);
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
	var attr, val;
	var natts = ndom.attributes;
	for (var k=0; k < natts.length; k++) {
		attr = natts[k];
		val = ndom.getAttribute(attr.name);
		dom.setAttribute(attr.name, val);
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

