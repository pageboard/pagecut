const {ProseMirror} = require("prosemirror/dist/edit");
const {Schema} = require("prosemirror/dist/model");
const basicSchema = require("prosemirror/dist/schema-basic");
const tableSchema = require("prosemirror/dist/schema-table");
const {exampleSetup, buildMenuItems} = require("prosemirror/dist/example-setup");
const {tooltipMenu, menuBar, selectParentNodeItem} = require("prosemirror/dist/menu");
const {posFromDOM} = require("prosemirror/dist/edit/dompos");

const UrlPlugin = require("./url-plugin");
const ComponentPlugin = require("./component-plugin");
const BreaksPlugin = require("./breaks-plugin");

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

let componentPlugin = ComponentPlugin.config(schemaSpec);

exports.defaults = {
	spec: schemaSpec,
	plugins: [
		BreaksPlugin.config(),
		exampleSetup.config({menuBar: false, tooltipMenu: false}),
		UrlPlugin.config({
			action: function(pm, url, child) {
				var types = pm.schema.nodes;
				var loadingId = 'id' + Math.round(Math.random() * 1e9);
				var loadingNode = types.component_resource.create({
					href: url,
					id: loadingId
				});
				pm.inspector(url, function(err, obj) {
					// find node
					var node = document.getElementById(loadingId);
					if (!node) {
						console.error('problem no node with id', loadingId);
					}
					var pos = posFromDOM(node);
					var begin = pos.pos;
					var $pos = pm.doc.resolve(begin);
					var end = begin + $pos.nodeAfter.nodeSize;

					if (err) {
						console.error(err);
						pm.tr.delete(begin, end).apply();
						return;
					}

					var titleField = types.component_field.create({
						name: "title"
					}, pm.schema.text(obj.title || obj.href));

					var descriptionField = types.component_field.create({
						name: "description"
					}, obj.description ? pm.schema.text(obj.description) : null);

					pm.tr.replaceWith(begin, end, types.component_resource.createAndFill({
						type: obj.type,
						href: obj.url,
						icon: obj.icon,
						thumbnail: obj.thumbnail
					}, [titleField, descriptionField])).apply();
				});
				return loadingNode;
			}
		}),
		componentPlugin
	],
	inspector: function(url, cb) {
		setTimeout(function() {
			cb(null, {
				type: 'link',
				title: url,
				url: url
			});
		});
	}
};

exports.init = function(config) {
	var opts = Object.assign({}, exports.defaults, config);
	if (opts.spec) {
		opts.schema = new Schema(opts.spec);
		delete opts.spec;
	}
	if (opts.content) {
		opts.doc = opts.schema.parseDOM(opts.content);
		delete opts.content;
	}

	let pm = new ProseMirror(opts);
	pm.inspector = opts.inspector;

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

