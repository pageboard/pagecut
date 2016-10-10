const {ProseMirror} = require("prosemirror/dist/edit");
const {Schema, Block, Inline, Attribute} = require("prosemirror/dist/model");
const inherits = require('./utils/inherits');
const basicSchema = require("prosemirror/dist/schema-basic");
const tableSchema = require("prosemirror/dist/schema-table");
const {exampleSetup, buildMenuItems} = require("prosemirror/dist/example-setup");
const {menuBar, selectParentNodeItem} = require("prosemirror/dist/menu");

const UrlPlugin = require("./utils/url-plugin");

const CoedPlugin = require("./plugin");

let schemaSpec = {
	nodes: {
		doc: {type: basicSchema.Doc, content: "block+"},

		paragraph: { type: basicSchema.Paragraph, content: "inline<_>*", group: "block" },
		blockquote: { type: basicSchema.BlockQuote, content: "block+", group: "block" },
		ordered_list: { type: basicSchema.OrderedList, content: "list_item+", group: "block" },
		bullet_list: { type: basicSchema.BulletList, content: "list_item+", group: "block" },
		horizontal_rule: { type: basicSchema.HorizontalRule, group: "block" },
		heading: { type: basicSchema.Heading, content: "inline<_>*", group: "block" },
		code_block: { type: basicSchema.CodeBlock, content: "text*", group: "block" },

		list_item: { type: basicSchema.ListItem, content: "paragraph block*" },

		table: { type: tableSchema.Table, content: "table_row[columns=.columns]+", group: "block" },
		table_row: { type: tableSchema.TableRow, content: "table_cell{.columns}" },
		table_cell: { type: tableSchema.TableCell, content: "inline<_>*" },

		text: {type: basicSchema.Text, group: "inline"},
		hard_break: {type: basicSchema.HardBreak, group: "inline"}
	},
	marks: {
		strong: basicSchema.StrongMark,
		em: basicSchema.EmMark
	}
};

exports.defaults = {
	spec: schemaSpec,
	types: Object.assign({}, basicSchema, tableSchema),
	plugins: [
		exampleSetup.config({menuBar: false, tooltipMenu: false})
	],
	components: []
};

exports.Editor = Editor;

function Editor(config) {
	var opts = this.opts = Object.assign({}, exports.defaults, config);

	if (!opts.components) opts.components = [];

	opts.plugins.push(UrlPlugin.config(opts));
	opts.plugins.push(CoedPlugin.config(opts));

	opts.components.forEach(function(component) {
		initType(opts.spec, component);
	});

	if (opts.spec) {
		opts.schema = new Schema(opts.spec);
		delete opts.spec;
	}

	let pm = this.pm = new ProseMirror(opts);

	let menu = buildMenuItems(pm.schema);
	// keep full menu but remove selectParentNodeItem menu
	var fullMenu = menu.fullMenu.map(function(arr) {
		return arr.filter(function(item) {
			return item != selectParentNodeItem;
		});
	});

	menuBar.config({
		float: true,
		content: fullMenu
	}).attach(pm);

	opts.components.forEach(function(component) {
		if (component.init) component.init(pm);
	});
}

Editor.prototype.set = function(dom, fn) {
	if (fn) this.opts.components.forEach(function(component) {
		component.setfn = fn;
	});
	this.pm.setDoc(this.pm.schema.parseDOM(dom));
	if (fn) this.opts.components.forEach(function(component) {
		delete component.setfn;
	});
};

Editor.prototype.get = function(fn) {
	this.opts.components.forEach(function(component) {
		component.getfn = fn || true;
	});
	var dom = this.pm.doc.content.toDOM();
	this.opts.components.forEach(function(component) {
		delete component.getfn;
	});
	return dom;
};

Editor.prototype.replace = function(stuff) {
	if (typeof stuff == "string") {
		this.pm.tr.typeText(stuff).applyAndScroll();
	} else if (stuff instanceof Node) {
		this.pm.tr.replaceSelection(this.pm.schema.parseDOM(stuff)).applyAndScroll();
	}
};

Editor.prototype.delete = function() {
	this.pm.tr.deleteSelection().applyAndScroll();
};

Editor.prototype.changed = function(fn) {
	this.pm.on.change.add(fn);
};

function initType(spec, component) {
	defineSpec(component, spec.nodes, component.to({}));
}

function defineSpec(component, specs, dom) {
	var content = [];
	var typeName, type;
	var contentName = dom.getAttribute('content-name');
	var specName, spec, recursive = false;
	if (!component.index) {
		component.index = 1;
		spec = {
			group: component.group || "block",
			type: getRootType(component, dom)
		};
		specName = typeName = "root_" + component.name;
		recursive = true;
	} else if (contentName) {
		spec = {
			type: getContentType(component, dom),
			content: component.contentSpec[contentName]
		};
		if (!spec.content) throw new Error("Missing component.contentSpec[" + contentName + "]");
		typeName = "content_" + component.name + component.index++;
		specName = typeName + '[content_name="' + contentName + '"]';
	} else if (dom.querySelector('[content-name]')) {
		specName = typeName = "wrap_" + component.name + component.index++;
		spec = {
			type: getWrapType(component, dom)
		};
		recursive = true;
	} else {
		specName = typeName = "hold_" + component.name + component.index++;
		spec = {
			type: getHoldType(component, dom)
		};
	}

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpec(component, specs, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		specs[typeName] = spec;
	}
	return specName;
}

function getRootType(component, dom) {
	var defaultAttrs = specAttrs(Object.assign({id: ""}, tagAttrs(dom)));

	function RootType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'root'; // used by plugin to detect node types
	};
	inherits(RootType, Block);

	Object.defineProperty(RootType.prototype, "attrs", { get: function() {
		var dataSpec = component.dataSpec, specVal, attOpt;
		var attrs = {};
		for (var k in dataSpec) {
			specVal = dataSpec[k];
			attOpt = {};
			if (typeof specVal == "string") {
				attOpt.default = specVal;
			} else {
				attOpt.default = specVal.default || "";
			}
			attrs['data-' + k] = new Attribute(attOpt);
		}
		return Object.assign({}, defaultAttrs, attrs);
	}});

	Object.defineProperty(RootType.prototype, "toDOM", { get: function() {
		return function(node) {
			var dom, ex;
			if (component.getfn) {
				ex = exportNode(node, true);
				if (component.getfn !== true) {
					dom = component.getfn(component, ex.data, ex.content);
				}
				if (dom == null && component.output) {
					dom = component.output(ex.data, ex.content);
				}
				return dom;
			} else {
				ex = exportNode(node);
				dom = component.to(ex.data);
				prepareDom(dom);
				return [dom.nodeName, nodeAttrs(dom), 0];
			}
		};
	}});

	Object.defineProperty(RootType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag.default] = function(dom) {
			var attrs = tagAttrs(dom);
			var data;
			if (component.setfn) data = component.setfn(component, dom);
			if (data == null) data = component.from(dom);
			for (var k in data) {
				attrs['data-' + k] = data[k];
			}
			dom.coedType = "root";
			prepareDom(dom);
			return attrs;
		};
		return ret;
	}});

	function exportNode(node, content) {
		var data = {};
		for (var k in node.attrs) {
			if (k.indexOf('data-') == 0) {
				data[k.substring(5)] = node.attrs[k];
			}
		}
		return {
			data: data,
			content: content ? collectContent(node) : null
		};
	}

	function prepareDom(dom) {
		var name;
		for (var i=0, child; i < dom.childNodes.length; i++) {
			child = dom.childNodes.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			name = child.getAttribute('content-name');
			if (name) {
				child.coedType = "content";
			} else if (child.querySelector('[content-name]')) {
				child.coedType = "wrap";
				prepareDom(child);
			} else {
				child.coedType = "hold";
			}
		}
	}

	function collectContent(node, content) {
		var type = node.type.coedType;
		if (type == "content") {
			content[node.attrs.content_name] = node.toDOM();
		} else if (type != "root" || !content) {
			if (!content) content = {};
			node.forEach(function(child) {
				collectContent(child, content);
			});
		}
		return content;
	}
	return RootType;
}

function getWrapType(component, dom) {
	var defaultAttrs = specAttrs(tagAttrs(dom));

	function WrapType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'wrap'; // used by plugin to detect node types
	};
	inherits(WrapType, Block);

	Object.defineProperty(WrapType.prototype, "attrs", { get: function() {
		return defaultAttrs;
	}});

	Object.defineProperty(WrapType.prototype, "toDOM", { get: function() {
		return function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		};
	}});

	Object.defineProperty(WrapType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag.default] = function(node) {
			if (node.coedType != "wrap") return false;
			return tagAttrs(node);
		};
		return ret;
	}});
	return WrapType;
}


function getContentType(component, dom) {
	var defaultAttrs = specAttrs(tagAttrs(dom));

	function ContentType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'content'; // used by plugin to detect node types
	};
	inherits(ContentType, Block);

	Object.defineProperty(ContentType.prototype, "attrs", { get: function() {
		return defaultAttrs;
	}});

	Object.defineProperty(ContentType.prototype, "toDOM", { get: function() {
		return function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		};
	}});

	Object.defineProperty(ContentType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag.default + '[content-name]'] = function(node) {
			if (node.coedType != "content") return false;
			return tagAttrs(node);
		};
		return ret;
	}});
	return ContentType;
}


function getHoldType(component, dom) {
	var defaultAttrs = specAttrs(Object.assign(tagAttrs(dom), {
		html: dom.outerHTML
	}));

	function HoldType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'hold';
	};
	inherits(HoldType, Block);

	Object.defineProperty(HoldType.prototype, "selectable", { get: function() {
		return false;
	}});

	Object.defineProperty(HoldType.prototype, "readonly", { get: function() {
		return true;
	}});

	Object.defineProperty(HoldType.prototype, "attrs", { get: function() {
		return defaultAttrs;
	}});

	Object.defineProperty(HoldType.prototype, "toDOM", { get: function() {
		return function(node) {
			var div = document.createElement("div");
			div.innerHTML = node.attrs.html;
			var elem = div.querySelector('*');
			if (elem == null) return "";
			return elem;
		};
	}});

	Object.defineProperty(HoldType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		var sel = defaultAttrs.tag.default;
		var selClass = defaultAttrs.class;
		if (selClass && selClass.default) sel += "." + selClass.default;
		ret[sel] = function(node) {
			if (node.coedType != "hold") return false;
			var attrs = tagAttrs(node);
			attrs.html = node.outerHTML;
			return attrs;
		};
		return ret;
	}});
	return HoldType;
}

function domAttrs(attrs) {
	var obj = {};
	Object.keys(attrs).forEach(function(k) {
		if (k == 'tag' || k == 'html') return;
		obj[k.replace(/_/g, '-')] = attrs[k];
	});
	return obj;
}

function tagAttrs(dom) {
	var obj = nodeAttrs(dom, true);
	obj.tag = dom.nodeName.toLowerCase();
	return obj;
}

function specAttrs(atts) {
	var obj = {};
	for (var k in atts) {
		obj[k] = new Attribute({
			'default': atts[k]
		});
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
