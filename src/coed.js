const {ProseMirror} = require("prosemirror/dist/edit");
const {Schema} = require("prosemirror/dist/model");
const basicSchema = require("prosemirror/dist/schema-basic");
const tableSchema = require("prosemirror/dist/schema-table");
const {exampleSetup, buildMenuItems} = require("prosemirror/dist/example-setup");
const {menuBar, selectParentNodeItem} = require("prosemirror/dist/menu");

const BreaksPlugin = require("./utils/breaks-plugin");

const EdbedPlugin = require("./edbed-plugin");

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

	opts.plugins.push(EdbedPlugin.config(opts));

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

