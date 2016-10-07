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

Editor.prototype.set = function(dom) {
	this.pm.setDoc(this.pm.schema.parseDOM(dom));
};

Editor.prototype.get = function() {
	this.opts.components.forEach(function(component) {
		component.alt = true;
	});
	var alt = this.pm.doc.content.toDOM();
	this.opts.components.forEach(function(component) {
		component.alt = false;
	});
	return alt;
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
		specName = typeName + '[name="' + contentName + '"]';
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
	var defaultAttrs = nodeDefaults(dom);

	function RootType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'root'; // used by plugin to detect node types
	};
	inherits(RootType, Block);

	Object.defineProperty(RootType.prototype, "attrs", { get: function() {
		var attrs = {
			"class": new Attribute({
				"default": defaultAttrs.class
			}),
			"tag": new Attribute({
				"default": defaultAttrs.tag
			})
		};
		var dataSpec = Object.assign({}, component.dataSpec);
		dataSpec.id = "";
		Object.keys(dataSpec).forEach(function(key) {
			var defaultVal = dataSpec[key];
			if (typeof defaultVal != "string") defaultVal = "";
			attrs[key] = new Attribute({
				"default": defaultVal
			});
		});
		return attrs;
	}});

	Object.defineProperty(RootType.prototype, "toDOM", { get: function() {
		return function(node) {
			var domNode;
			if (component.alt && component.output) {
				return component.output(node.attrs, collectContent({}, node));
			}
			domNode = component.to(node.attrs);
			prepareDom(domNode, node);
			return [domNode.nodeName, nodeAttrs(domNode), 0];
		};
	}});

	Object.defineProperty(RootType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag] = function(node) {
			var attrs = nodeDefaults(node);
			var data = component.from(node);
			node.coedType = "root";
			prepareDom(node);
			for (var k in attrs) data[k] = attrs[k];
			return data;
		};
		return ret;
	}});

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

	function collectContent(content, node) {
		if (node.type.coedType == "content") {
			content[node.attrs.name] = node.toDOM().innerHTML;
		} else {
			node.forEach(function(child) {
				collectContent(content, child);
			});
		}
		return content;
	}
	return RootType;
}

function getWrapType(component, dom) {
	var defaultAttrs = nodeDefaults(dom);

	function WrapType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'wrap'; // used by plugin to detect node types
	};
	inherits(WrapType, Block);

	function from(dom) {
		return {
			'class': dom.className || "",
			tag: dom.nodeName
		};
	}

	Object.defineProperty(WrapType.prototype, "attrs", { get: function() {
		return {
			"class": new Attribute({
				"default": defaultAttrs.class
			}),
			"tag": new Attribute({
				"default": defaultAttrs.tag
			})
		};
	}});

	Object.defineProperty(WrapType.prototype, "toDOM", { get: function() {
		return function(node) {
			var attrs = node.attrs;
			return [attrs.tag, {
				'class': attrs.class
			}, 0];
		};
	}});

	Object.defineProperty(WrapType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag] = function(node) {
			if (node.coedType != "wrap") return false;
			var attrs = nodeDefaults(node);
			return attrs;
		};
		return ret;
	}});
	return WrapType;
}


function getContentType(component, dom) {
	var defaultAttrs = nodeDefaults(dom, ["content-name"]);

	function ContentType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'content'; // used by plugin to detect node types
	};
	inherits(ContentType, Block);

	Object.defineProperty(ContentType.prototype, "attrs", { get: function() {
		return {
			"name": new Attribute({
				"default": defaultAttrs['content-name']
			}),
			"class": new Attribute({
				"default": defaultAttrs.class
			}),
			"tag": new Attribute({
				"default": defaultAttrs.tag
			})
		};
	}});

	Object.defineProperty(ContentType.prototype, "toDOM", { get: function() {
		return function(node) {
			var attrs = node.attrs;
			return [attrs.tag, {
				'class': attrs.class,
				'content-name': attrs['name']
			}, 0];
		};
	}});

	Object.defineProperty(ContentType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[defaultAttrs.tag + '[content-name]'] = function(node) {
			if (node.coedType != "content") return false;
			var attrs = nodeDefaults(node, ["content-name"]);
			attrs.name = attrs['content-name'];
			delete attrs['content-name'];
			return attrs;
		};
		return ret;
	}});
	return ContentType;
}


function getHoldType(component, dom) {
	var defaultAttrs = nodeDefaults(dom);
	defaultAttrs.html = dom.outerHTML;

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
		return {
			html: new Attribute({
				"default": defaultAttrs.html
			}),
			tag: new Attribute({
				"default": defaultAttrs.tag
			}),
			"class": new Attribute({
				"default": defaultAttrs.class
			})
		};
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
		var classe = defaultAttrs.class;
		if (classe) classe = '.' + classe;
		else classe = "";
		ret[defaultAttrs.tag + classe] = function(node) {
			if (node.coedType != "hold") return false;
			var attrs = nodeDefaults(node);
			attrs.html = node.outerHTML;
			return attrs;
		};
		return ret;
	}});
	return HoldType;
}

function nodeDefaults(dom, atts) {
	var obj = {
		'class': dom.className || "",
		tag: dom.nodeName.toLowerCase()
	};
	var val, att;
	if (atts) for (var i=0; i < atts.length; i++) {
		att = atts[i];
		val = dom.getAttribute(att);
		if (val) obj[att] = val;
	}
	return obj;
}

function nodeAttrs(node) {
	var obj = {};
	var atts = node.attributes;
	var att;
	for (var i=0; i < atts.length; i++) {
		att = atts[i];
		obj[att.name] = att.value;
	}
	return obj;
}
