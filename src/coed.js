const {ProseMirror} = require("prosemirror/dist/edit");
const {Schema, Block, Attribute} = require("prosemirror/dist/model");
const inherits = require('./utils/inherits');
const basicSchema = require("prosemirror/dist/schema-basic");
const tableSchema = require("prosemirror/dist/schema-table");
const {exampleSetup, buildMenuItems} = require("prosemirror/dist/example-setup");
const {menuBar, selectParentNodeItem} = require("prosemirror/dist/menu");

const BreaksPlugin = require("./utils/breaks-plugin");

const CoedPlugin = require("./plugin");
const CoLink = require("./coed-link");

ProseMirror.prototype.parseDomNode = function(node) {
	var div = document.createElement("div");
	div.appendChild(node);
	var newNode = this.schema.parseDOM(div);
	return newNode.firstChild;
};

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
	plugins: [
		BreaksPlugin.config(),
		exampleSetup.config({menuBar: false, tooltipMenu: false})
	]
};

exports.init = function(config) {
	var opts = Object.assign({}, exports.defaults, config);

	opts.plugins.push(CoedPlugin.config(opts));

	if (!opts.components) opts.components = [
		new CoLink(opts)
	];

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
	return pm;
};


function initType(spec, opts) {
	var specTag = opts.tag.replace(/-/g, '_');
	var contentNames = Object.keys(opts.contents).map(function(name) {
		var contentTagName = specTag + '_' + name;
		spec.nodes[contentTagName] = {
			type: getCoType(name, opts),
			content: opts.contents[name]
		};
		return contentTagName;
	});

	spec.nodes[specTag] = {
		type: getType(opts),
		content: contentNames.join(' '),
		group: "block"
	};

}

function getType(opts) {
	function CoType(name, schema) {
		Block.call(this, name, schema);
	};
	inherits(CoType, Block);

	Object.defineProperty(CoType.prototype, "attrs", { get: function() {
		var typeAttrs = {};
		var attrs = opts.attrs;
		Object.keys(attrs).forEach(function(key) {
			var defaultVal = attrs[key];
			if (typeof defaultVal != "string") defaultVal = "";
			typeAttrs[key] = new Attribute({
				"default": defaultVal
			});
		});
		return typeAttrs;
	}});

	Object.defineProperty(CoType.prototype, "toDOM", { get: function() {
		return function(node) {
			var contents = {};
			node.forEach(function(node) {
				var name = node.attrs.name;
				if (!name) return;
				contents[name] = node.toDOM();
			});
			return opts.to(node.attrs, contents);
		};
	}});

	Object.defineProperty(CoType.prototype, "matchDOMTag", { get: function() {
		var ret = {};
		ret[opts.tag] = function(node) {
			if (node.getAttribute('name')) return false;
			var obj = opts.from(node);
			var parent = document.createElement('div');
			Object.keys(obj.contents).forEach(function(name) {
				var contNode = document.createElement('div');
				contNode.setAttribute('name', name);
				var cont = obj.contents[name];
				while (cont.firstChild) {
					contNode.appendChild(cont.firstChild);
				}
				parent.appendChild(contNode);
			});
			return [obj.attrs, {content: parent}];
		};
		return ret;
	}});
	return CoType;
}

function getCoType(name, opts) {
	function CoCoType(name, schema) {
		Block.call(this, name, schema);
	};
	inherits(CoCoType, Block);

	Object.defineProperty(CoCoType.prototype, "attrs", { get: function() {
		return {
			name: new Attribute({
				"default": name
			})
		};
	}});

	Object.defineProperty(CoCoType.prototype, "toDOM", { get: function() {
		return function(node) {
			return ["div", node.attrs, 0];
		};
	}});

	Object.defineProperty(CoCoType.prototype, "matchDOMTag", { get: function() {
		return {
			'div[name]': function(node) {
				var attrs = {
					name: node.getAttribute('name')
				};
				if (!attrs.name) return false;
				return attrs;
			}
		};
	}});
	return CoCoType;
}
