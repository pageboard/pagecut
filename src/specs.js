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

function define(view, elt, schema, views) {
	if (!view.tags) view.tags = {};
	if (typeof elt.contents == "string") elt.contents = {
		spec: elt.contents
	};
	if (elt.name == "text") {
		schema.nodes = schema.nodes.remove(elt.name);
		schema.nodes = schema.nodes.addToStart(elt.name, elt);
		return;
	}
	if (!elt.render) return; // some elements are not meant to be rendered
	var dom = view.render(view.blocks.create(elt.name), {merge: false});
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
		var contents = elt.contents;

		if (obj.children && obj.children.length) {
			// this type of node has content that is wrap or container type nodes
			spec.content = obj.children.map(function(child) {
				if (!child.name) console.warn(obj, "has no name for child", child);
				return child.name;
			}).join(" ");
		} else if (contents) {
			var contentName = (obj.contentDOM || obj.dom).getAttribute('block-content');
			if (contents.spec == null || typeof contents.spec != "string") {
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
						if (contentSpec.marks) {
							spec.marks = contentSpec.marks;
						}
					}
				}
			} else {
				if (!elt.inplace) {
					console.error("contents can be a string spec only for inplace element", elt);
				} else {
					if (contents.spec) {
						spec.content = contents.spec;
					}
					if (contents.marks) {
						spec.marks = contents.marks;
					}
				}
			}
		}
		if (!obj.name) {
			obj.name = `${elt.name}_${type}_${spec.contentName || index++}`;
		}

		var parseTag = spec.parseDOM && spec.parseDOM[0].tag;
		if (parseTag) {
			var parseTagKey = spec.typeName == "root" ? parseTag : `${elt.name} ${parseTag}`;
			if (elt.context) parseTagKey += " " + elt.context;
			var oldName = view.tags[parseTagKey];
			if (oldName) {
				console.info(`Two elements with same tag "${parseTag}" - ${oldName} and ${obj.name}`);
			} else {
				view.tags[parseTagKey] = obj.name;
			}
		}

		if (type == "root") {
			var existingName = elt.replaces || elt.name;
			if (elt.inline && elt.contents) {
				if (schema.marks.get(existingName)) {
					schema.marks = schema.marks.remove(existingName);
				}
			} else {
				if (schema.nodes.get(existingName)) {
					schema.nodes = schema.nodes.remove(existingName);
				}
			}
		}
		if (spec.inline && elt.contents) {
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
	if (elt.contents == null) return;
	if (elt.inline || typeof elt.contents.spec == "string") return dom;
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
					obj._default = child.text.trim() || undefined;
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
	var attrs = Object.assign(attrsTo(node.attrs), restoreDomAttrs(node.attrs._json), domAttrsMap(obj.dom));
	var contentName = node.type.spec.contentName;
	var rootContainer = contentName && (!obj.contentDOM || obj.dom == obj.contentDOM);
	while (dom) {
		if (!obj.contentDOM || node instanceof Model.Mark) return [dom.nodeName, attrs];
		if (dom != obj.dom) {
			out = [dom.nodeName, {
				'class': dom.className || undefined,
				'block-content': dom.getAttribute('block-content') || undefined
			}, out];
		} else {
			out = [dom.nodeName, attrs, out];
			if (rootContainer) out[1]['block-content'] = contentName;
			break;
		}
		dom = dom.parentNode;
	}
	return out;
}

function createRootSpec(view, elt, obj) {
	var defaultAttrs = {
		id: null,
		focused: null,
		data: null,
		type: elt.name,
		standalone: elt.standalone ? "true" : null,
		_default: obj._default || null,
		_json: saveDomAttrs(obj.dom)
	};

	var defaultSpecAttrs = specAttrs(defaultAttrs);
	if (elt.inline && elt.contents) obj.contentDOM = obj.dom;

	var parseRule = {
		priority: 1000 - (elt.priority || 0),
		getAttrs: function(dom) {
			var type = dom.getAttribute('block-type') || elt.name;
			var id = dom.getAttribute('block-id');
			var standalone = dom.getAttribute('block-standalone') == "true";
			var data = dom.getAttribute('block-data');
			var attrs = {
				type: type
			};
			if (data) {
				attrs.data = data;
			} else if (elt.parse) {
				attrs.data = JSON.stringify(elt.parse.call(elt, dom));
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
					// attrs does not contain id so it's like setting a new id
				}
				view.blocks.set(block);
			}
			attrs = view.blocks.toAttrs(block);
			attrs.type = type;
			return attrs;
		},
		contentElement: function(dom) { return findContent(elt, dom); }
	};
	if (elt.context) parseRule.context = elt.context;

	if (elt.tag) {
		parseRule.tag = elt.tag;
	} else if (elt.inplace) {
		parseRule.tag = domSelector(obj.dom);
	} else {
		parseRule.tag = `[block-type="${elt.name}"]`;
	}

	var spec = {
		typeName: "root",
		element: elt,
		domModel: obj.dom,
		inline: !!elt.inline,
		defining: obj.dom != obj.contentDOM,
		isolating: elt.isolating !== undefined ? elt.isolating : !elt.inline,
		attrs: Object.assign({}, defaultSpecAttrs),
		parseDOM: [parseRule],
		toDOM: function(node) {
			var id = node.attrs.id;
			if (!id && node.marks && node.marks[0]) {
				id = node.marks[0].attrs.id;
				console.warn("Probably unsupported case of id from in node.marks", elt.inline, node);
			}
			var block;
			if (id) block = view.blocks.get(id);
			if (!block) block = view.blocks.fromAttrs(node.attrs);
			else block.focused = node.attrs.focused;

			var dom = view.render(block, {type: node.attrs.type, merge: false});
			if (!dom) {
				console.error("Rendering", block, "with", node.attrs.type, "returns no dom");
				return "";
			}
			var uView = flagDom(elt, dom);
			var out = toDOMOutputSpec(uView, node);
			return out;
		}
	};
	if (elt.marks) spec.marks = elt.marks;
	if (!elt.inline || !elt.inplace) spec.nodeView = RootNodeView;
	// explicitely allow dragging for nodes without contentDOM
	if (elt.draggable !== undefined) {
		spec.draggable = elt.draggable;
	} else if (!obj.contentDOM) {
		spec.draggable = true;
		spec.atom = true;
	}
	if (elt.group) spec.group = elt.group;

	return spec;
}

function createWrapSpec(view, elt, obj) {
	var defaultAttrs = attrsFrom(obj.dom);
	defaultAttrs._json = null;
	if (obj._default != null) {
		console.warn("untested, wrapper has _default");
		defaultAttrs._default = obj._default;
	}
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	var parseRule = {
		tag: domSelector(obj.dom) + ':not([block-type])',
		getAttrs: function(dom) {
			var attrs = attrsFrom(dom);
			var json = saveDomAttrs(dom);
			if (json) attrs._json = json;
			return attrs;
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
	if (obj.contentDOM != obj.dom) {
		defaultAttrs.content = obj.contentDOM.getAttribute("block-content");
	}
	defaultAttrs._json = null;
	if (obj._default != null) defaultAttrs._default = obj._default;
	var defaultSpecAttrs = specAttrs(defaultAttrs);
	var tag;
	if (obj.dom == obj.contentDOM) {
		tag = `${obj.dom.nodeName.toLowerCase()}[block-content="${defaultAttrs.content}"]`;
	} else {
		tag = domSelector(obj.dom);
	}
	var parseRule = {
		tag: tag + ':not([block-type])',
		getAttrs: function(dom) {
			var attrs = attrsFrom(dom);
			var json = saveDomAttrs(dom);
			if (json) attrs._json = json;
			return attrs;
		},
		contentElement: function(dom) { return findContent(elt, dom); }
	};

	var spec = {
		typeName: "container",
		element: elt,
		domModel: obj.dom,
		attrs: defaultSpecAttrs,
		defining: obj.dom != obj.contentDOM,
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
	if (!me.contentDOM || me.contentDOM == me.dom) return;
	if (['span'].indexOf(me.contentDOM.nodeName.toLowerCase()) < 0) return;

	me.contentDOM.setAttribute("contenteditable", "true");
	me.dom.setAttribute("contenteditable", "false");

	[
		'focus',
		'selectionchange',
		// 'DOMCharacterDataModified'
	].forEach(function(type) {
		me.contentDOM.addEventListener(type, function(e) {
			me.view.dom.dispatchEvent(new e.constructor(e.type, e));
		}, false);
	});
}

function RootNodeView(node, view, getPos, decorations) {
	if (!(this instanceof RootNodeView)) {
		return new RootNodeView(node, view, getPos, decorations);
	}
	this.view = view;
	this.element = node.type.spec.element;
	this.domModel = node.type.spec.domModel;
	this.getPos = typeof getPos == "function" ? getPos : null;
	this.id = node.attrs.id;
	var block;
	if (this.id) {
		if (this.element.inplace) {
			delete node.attrs.id;
			delete this.id;
		} else {
			block = view.blocks.get(this.id);
		}
	}
	if (!block) {
		if (node.attrs.id) {
			delete node.attrs.id;
			delete this.id;
		}
		block = view.blocks.fromAttrs(node.attrs);
	}
	if (!this.element.inplace && !this.id) {
		view.blocks.set(block);
		this.id = node.attrs.id = block.id;
	}

	if (block.focused) delete block.focused;

	setupView(this);
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

function updateContainerId(node, id) {
	if (node.forEach) node.forEach(function(child, offset, index) {
		var tn = child.type.spec.typeName;
		if (tn == "container") {
			child.attrs.root_id = id;
		} else if (tn == "wrap") {
			updateContainerId(child, id);
		}
	});
}

RootNodeView.prototype.update = function(node, decorations) {
	if (this.element.name != node.attrs.type) {
		return false;
	}
	var oldBlock = this.oldBlock;
	if (node.attrs.id != this.id) {
		return false;
	}
	updateContainerId(node, this.id);
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
	var sameFocus = oldBlock && this.oldBlock.focused == node.attrs.focused;

	if (!sameData || !sameFocus) {
		this.oldBlock = this.view.blocks.copy(block);
		this.oldBlock.focused = node.attrs.focused;

		if (node.attrs.focused) block.focused = node.attrs.focused;
		else delete block.focused;

		var dom = this.view.render(block, {type: node.attrs.type, merge: false});
		var tr = this.view.state.tr;
		var curpos = this.getPos ? this.getPos() : undefined;
		if (isNaN(curpos)) curpos = undefined;
		if (sameData) {
			mutateAttributes(this.dom, dom);
		} else {
			mutateNodeView(tr, curpos, node, this, flagDom(this.element, dom));
		}
		// this is completely crazy to do that
		if (oldBlock && curpos !== undefined && tr.docChanged) {
			this.view.dispatch(tr);
		}
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
		attrs.type = this.element.name;
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
	restoreDomAttrs(node.attrs._json, this.dom);
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
	this.id = node.attrs.root_id;
	setupView(this);
	this.contentName = node.type.spec.contentName;
	this.update(node);
}

ContainerNodeView.prototype.update = function(node, decorations) {
	var contentName = node.type.spec.contentName;
	if (contentName != this.contentName) {
		console.warn("cannot update to a different content name", contentName, this.contentName);
		return false;
	}
	restoreDomAttrs(node.attrs._json, this.dom);
	var id = node.attrs.root_id;
	if (!id || id != this.id) {
		return false;
	}
	var block = this.view.blocks.get(id);
	if (!block) {
		console.warn("container has no root node id", this, node);
		return false;
	}

	if (!block.content) block.content = {};
	if (block.content[contentName] != this.contentDOM) {
		block.content[contentName] = this.contentDOM;
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

/*
problem: nodes between obj.dom and obj.contentDOM (included) can be modified
by front-end. So when applying a new rendered DOM, one only wants to apply
diff between initial rendering and new rendering, leaving user modifications
untouched.
*/
function mutateNodeView(tr, pos, pmNode, obj, nobj) {
	var dom = obj.dom;
	var initial = !obj._pcinit;
	if (initial) obj._pcinit = true;
	if (nobj.dom.nodeName != dom.nodeName) {
		var emptyDom = nobj.dom.cloneNode(false);
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
		var curpos = pos + 1;
		nobj.children.forEach(function(childObj, i) {
			var pmChild = pmNode.child(i);
			var newAttrs = Object.assign({}, pmChild.attrs, {_json: saveDomAttrs(childObj.dom)});
			if (pos !== undefined) tr.setNodeMarkup(curpos, null, newAttrs);
			pmChild.attrs = newAttrs; // because we want the modification NOW
			var viewDom = Array.prototype.find.call(obj.contentDOM.childNodes, function(child, i) {
				return child.pmViewDesc && child.pmViewDesc.node == pmChild;
			});
			if (viewDom) {
				mutateNodeView(tr, curpos, pmChild, viewDom.pmViewDesc, childObj);
			}
			curpos += pmChild.nodeSize;
		}, this);
	}
	// first upgrade attributes
	mutateAttributes(obj.dom, nobj.dom);
	// then upgrade descendants
	var parent, node;
	if (!obj.contentDOM) {
		// remove all _pcElt
		parent = obj.dom;
		node = parent.firstChild;
		var cur;
		while (node) {
			if (node._pcElt || initial) {
				cur = node;
			} else {
				cur = null;
			}
			node = node.nextSibling;
			if (cur) parent.removeChild(cur);
		}
		node = nobj.dom.firstChild;
		while (node) {
			node._pcElt = true;
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

	while (cont != obj.dom) {
		mutateAttributes(cont, ncont);
		parent = cont.parentNode;
		node = cont;
		while (node.previousSibling) {
			if (node.previousSibling._pcElt || initial) {
				parent.removeChild(node.previousSibling);
			} else {
				node = node.previousSibling;
			}
		}
		node = cont;
		while (node.nextSibling) {
			if (node.nextSibling._pcElt || initial) {
				parent.removeChild(node.nextSibling);
			} else {
				node = node.nextSibling;
			}
		}
		while ((node = ncont.parentNode.firstChild) != ncont) {
			node._pcElt = true;
			parent.insertBefore(node, cont);
		}
		node = ncont;
		while (node.nextSibling) {
			node.nextSibling._pcElt = true;
			parent.appendChild(node.nextSibling);
		}
		cont = parent;
		ncont = ncont.parentNode;
	}
}

function mapOfClass(att) {
	var map = {};
	att.split(' ').forEach(function(str) {
		str = str.trim();
		if (str) map[str] = true;
	});
	return map;
}

function applyDiffClass(src, dst, tar) {
	var srcMap = mapOfClass(src);
	var dstMap = mapOfClass(dst);
	var tarMap = mapOfClass(tar);

	Object.keys(dstMap).forEach(function(str) {
		if (!srcMap[str]) {
			tarMap[str] = true;
		}
	});
	for (var str in srcMap) {
		if (!dstMap[str]) {
			delete tarMap[str];
		}
	}
	return Object.keys(tarMap).join(' ');
}

function mutateAttributes(dom, ndom) {
	// TODO all changes go through here, except maybe block-* related ones
	// SO, store into dom._pcAttrs the last copy, and compare
	var attr, name, val, oval;
	var natts = ndom.attributes;
	var iatts = dom._pcAttrs;
	if (!iatts) iatts = dom._pcAttrs = {};
	for (var k=0; k < natts.length; k++) {
		attr = natts[k];
		name = attr.name;
		if (name == "contenteditable") continue;
		oval = dom.getAttribute(name);
		val = attr.value;
		if (iatts[name] == null || iatts[name] == oval) {
			if (val != oval) dom.setAttribute(name, val);
		} else if (name == "class") {
			dom.setAttribute(name, applyDiffClass(iatts[name], oval, val));
		} else {
			// TODO what ?
			dom.setAttribute(name, val);
		}
		iatts[name] = val;
	}

	var atts = dom.attributes;
	for (var j=0; j < atts.length; j++) {
		attr = atts[j];
		name = attr.name;
		if (name == "block-content" || name == "contenteditable") continue;
		if ((name.startsWith('block-') || (iatts[name] != null && iatts[name] == attr.value)) && !ndom.hasAttribute(name)) {
			dom.removeAttribute(name);
			delete iatts[name];
		}
	}
}

function saveDomAttrs(dom) {
	var map = domAttrsMap(dom);
	if (Object.keys(map).length == 0) return;
	return JSON.stringify(map);
}

function restoreDomAttrs(json, dom) {
	if (!json) return;
	var map;
	try {
		map = JSON.parse(json);
	} catch(ex) {
		console.info("Bad attributes", json);
	}
	if (!map) return;
	if (!dom) return map;
	var iatts = dom._pcAttrs;
	if (!iatts) iatts = dom._pcAttrs = {};
	var oval, val, name;
	for (name in map) {
		if (name == "contenteditable") continue;
		oval = dom.getAttribute(name);
		val = map[name];
		if (iatts[name] == null || iatts[name] == oval) {
			if (val != oval) dom.setAttribute(name, val);
		} else if (name == "class") {
			dom.setAttribute(name, applyDiffClass(iatts[name], oval, val));
		} else {
			// TODO what ?
			dom.setAttribute(name, val);
		}
		iatts[name] = val;
	}

	var atts = dom.attributes;
	for (var i=0; i < atts.length; i++) {
		name = atts[i].name;
		if (name == "contenteditable") continue;
		if (!name.startsWith('block-') && map[name] === undefined && iatts[name] == null) {
			dom.removeAttribute(name);
		}
	}
}

function domAttrsMap(dom) {
	var map = {};
	var atts = dom.attributes;
	var att;
	for (var k=0; k < atts.length; k++) {
		att = atts[k];
		if (att.value && !att.name.startsWith('block-')) map[att.name] = att.value;
	}
	return map;
}

function attrsTo(attrs) {
	var domAttrs = {};
	for (var k in attrs) {
		if (!k.startsWith('_') && attrs[k] != null) domAttrs['block-' + k] = attrs[k];
	}
	return domAttrs;
}

function attrsFrom(dom) {
	var domAttrs = dom.attributes;
	var att, attrs = {};
	for (var i=0; i < domAttrs.length; i++) {
		att = domAttrs[i];
		if (att.name.startsWith('block-')) {
			attrs[att.name.substring(6)] = att.value;
		}
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

function domSelector(dom) {
	var sel = dom.nodeName.toLowerCase();
	var className = dom.className;
	if (className) {
		sel += className.split(' ').filter(function(str) {
			return !!str;
		}).map(function(str) {
			return '.' + str;
		}).join('');
	}
	return sel;
}

