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


function initType(spec, def) {
	var defName = def.name;
	var groupName = 'group_' + defName;

	// named content
	var contentNames = Object.keys(def.contents).map(function(name) {
		var contentTagName = 'content_' + defName + '_' + name;
		spec.nodes[contentTagName] = {
			type: getContentType(name, def),
			content: def.contents[name],
			group: groupName
		};
		return contentTagName;
	});

	// holder
	spec.nodes['hold_' + defName] = {
		type: getHoldType(def),
		group: groupName
	};

	// wrapper
	spec.nodes['wrap_' + defName] = {
		type: getWrapType(def),
		content: groupName + '+',
		group: groupName
	};


	// root
	spec.nodes[defName] = {
		type: getRootType(def),
		content: groupName + '+',
		group: def.group || "block"
	};

}

function getRootType(opts) {
	function RootType(name, schema) {
		Block.call(this, name, schema);
	};
	inherits(RootType, Block);

	Object.defineProperty(RootType.prototype, "attrs", { get: function() {
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

	Object.defineProperty(RootType.prototype, "toDOM", { get: function() {
		return function(node) {
			var domNode = opts.to(node.attrs);
			domNode.setAttribute('coed', 'root');
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
		var domChild, type, coedName;
		for (var i=0; i < dom.childNodes.length; i++) {
			domChild = dom.childNodes.item(i);
			if (domChild.nodeType != Node.ELEMENT_NODE) continue;

			coedName = domChild.getAttribute('coed-name');
			if (coedName) {
				type = 'content';
			} else if (domChild.querySelector('[coed-name]')) {
				type = 'wrap';
				domChild.setAttribute('coed', 'wrap');
			} else {
				type = 'hold';
				domChild.setAttribute('contenteditable', 'false');
			}

			if (type == 'wrap') {
				prepareDom(domChild);
			}
		}
	}
	return RootType;
}

function getWrapType(opts) {
	function WrapType(name, schema) {
		Block.call(this, name, schema);
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
				'class': attrs['class'],
				coed: 'wrap'
			}, 0];
		};
	}});

	Object.defineProperty(WrapType.prototype, "matchDOMTag", { get: function() {
		return {
			'[coed="wrap"]': function(node) {
				return {};
			}
		};
	}});
	return WrapType;
}


function getContentType(coedName, opts) {
	function ContentType(name, schema) {
		Block.call(this, name, schema);
	};
	inherits(ContentType, Block);

	Object.defineProperty(ContentType.prototype, "attrs", { get: function() {
		return {
			name: new Attribute({
				"default": coedName
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
				var name = node.getAttribute('coed-name');
				if (name != coedName) {
					// selects the ContentType with the right schema
					return false;
				}
				return {
					name: coedName
				};
			}
		};
	}});
	return ContentType;
}


function getHoldType(opts) {
	function HoldType(name, schema) {
		Block.call(this, name, schema);
	};
	inherits(HoldType, Block);

	Object.defineProperty(HoldType.prototype, "isBlock", { get: function() {
		// or else pm wraps nodes contentEditable == false in a div
		return false;
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
			var elem = div.firstChild;
			return elem;
		};
	}});

	Object.defineProperty(HoldType.prototype, "matchDOMTag", { get: function() {
		return {
			'[contenteditable="false"]': function(node) {
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
