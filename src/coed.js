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
	handlers: [],
	components: []
};

exports.init = function(config) {
	var opts = Object.assign({}, exports.defaults, config);

	if (!opts.components) opts.components = [];
	if (!opts.handlers) opts.handlers = [];

	opts.plugins.push(UrlPlugin.config(opts));
	opts.plugins.push(CoedPlugin.config(opts));

	opts.components.forEach(function(def) {
		initType(opts.spec, def);
	});

	if (opts.spec) {
		opts.schema = new Schema(opts.spec);
		delete opts.spec;
	}
	if (opts.content) {
		opts.doc = opts.schema.parseDOM(opts.content);
		delete opts.content;
	}

	let pm = new ProseMirror(opts);

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

	opts.components.forEach(function(def) {
		if (def.init) def.init(pm);
	});
	return pm;
};


function initType(spec, def) {
	var baseDom = def.to({});
	defineSpec(def, spec.nodes, baseDom);
}

function defineSpec(def, specs, dom) {
	var content = [];
	var typeName, type;
	var coedName = dom.getAttribute('coed-name');
	var specName, spec, recursive = false;
	if (!def.index) {
		def.index = 1;
		spec = {
			group: def.group || "block",
			type: getRootType(def)
		};
		specName = typeName = "root_" + def.name;
		recursive = true;
	} else if (coedName) {
		spec = {
			type: getContentType(def),
			content: def.contents[coedName]
		};
		if (!spec.content) throw new Error("Missing def.contents[" + coedName + "]");
		typeName = "content_" + def.name + def.index++;
		specName = typeName + '[name="' + coedName + '"]';
	} else if (dom.querySelector('[coed-name]')) {
		specName = typeName = "wrap_" + def.name + def.index++;
		spec = {
			type: getWrapType(def)
		};
		recursive = true;
	} else {
		specName = typeName = "hold_" + def.name;
		if (!specs[typeName]) {
			spec = {
				type: getHoldType(def)
			};
		}
	}

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpec(def, specs, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		specs[typeName] = spec;
	}
	return specName;
}

function getRootType(opts) {
	function RootType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'root'; // used by plugin to detect node types
	};
	inherits(RootType, Block);

	Object.defineProperty(RootType.prototype, "attrs", { get: function() {
		var typeAttrs = {};
		var attrs = opts.attrs;
		attrs.id = "";
		Object.keys(attrs).forEach(function(key) {
			var defaultVal = attrs[key];
			if (typeof defaultVal != "string") defaultVal = "";
			typeAttrs[key] = new Attribute({
				"default": defaultVal
			});
		});
		return typeAttrs;
	}});

	Object.defineProperty(RootType.prototype, "toDOM", { get: function() {
		return function(node) {
			var domNode = opts.to(node.attrs);
			prepareDom(domNode, node);
			return [domNode.nodeName, nodeAttrs(domNode), 0];
		};
	}});

	Object.defineProperty(RootType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[opts.tag] = function(node) {
			var attrs = opts.from(node);
			prepareDom(node);
			return attrs;
		};
		return ret;
	}});

	function prepareDom(dom) {
		var name;
		for (var i=0, child; i < dom.childNodes.length; i++) {
			child = dom.childNodes.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			name = child.getAttribute('coed-name');
			if (name) {
				// nothing
			} else if (child.querySelector('[coed-name]')) {
				prepareDom(child);
			} else {

			}
		}
	}
	return RootType;
}

function getWrapType(opts) {
	function WrapType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'wrap'; // used by plugin to detect node types
	};
	inherits(WrapType, Block);

	Object.defineProperty(WrapType.prototype, "attrs", { get: function() {
		return {
			"class": new Attribute({
				"default": ""
			}),
			"tag": new Attribute({
				"default": "div"
			})
		};
	}});

	Object.defineProperty(WrapType.prototype, "toDOM", { get: function() {
		return function(node) {
			var attrs = node.attrs;
			return [attrs.tag, {
				'class': attrs['class']
			}, 0];
		};
	}});

	Object.defineProperty(WrapType.prototype, "matchDOMTag", { get: function() {
		return {
			'*': function(node) {
				var tagName = node.nodeName.toLowerCase();
				if (tagName == opts.tag || !node.querySelector('[coed-name]')) return false;
				return {
					tag: tagName,
					"class": node.getAttribute("class")
				};
			}
		};
	}});
	return WrapType;
}


function getContentType(opts) {
	function ContentType(name, schema) {
		Block.call(this, name, schema);
		this.coedType = 'content'; // used by plugin to detect node types
	};
	inherits(ContentType, Block);

	Object.defineProperty(ContentType.prototype, "attrs", { get: function() {
		return {
			name: new Attribute({
				"default": ""
			}),
			"class": new Attribute({
				"default": ""
			}),
			"tag": new Attribute({
				"default": "div"
			})
		};
	}});

	Object.defineProperty(ContentType.prototype, "toDOM", { get: function() {
		return function(node) {
			var attrs = node.attrs;
			return [attrs.tag, {
				'class': attrs['class'],
				'coed-name': attrs.name
			}, 0];
		};
	}});

	Object.defineProperty(ContentType.prototype, "matchDOMTag", { get: function() {
		return {
			'[coed-name]': function(node) {
				return {
					name: node.getAttribute('coed-name')
				};
			}
		};
	}});
	return ContentType;
}


function getHoldType(opts) {
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
				"default": ""
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
		return {
			'*': function(node) {
				if (node.hasAttribute('coed-name') || node.querySelector('[coed-name]')) return false;
				return {html: node.outerHTML};
			}
		};
	}});
	return HoldType;
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
