var model = require("prosemirror/dist/model");

var inherits = require('./inherits');

exports.ComponentResource = ComponentResource;
exports.ComponentWidget = ComponentWidget;
exports.ComponentField = ComponentField;
exports.ComponentFields = ComponentFields;

function ComponentResource(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(ComponentResource, model.Block);

Object.defineProperty(ComponentResource.prototype, "attrs", { get: function() {
	return {
		id: new model.Attribute({ default: "" }),
		href: new model.Attribute({ default: "" }),
		type:  new model.Attribute({ default: "none" }),
		icon: new model.Attribute({ default: "" }),
		thumbnail: new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(ComponentResource.prototype, "toDOM", { get: function() {
	return function(node) {
		var attrs = node.attrs;
		var output = ["component-resource", attrs];
		if (attrs.href && attrs.type == "none") {
			output.push(['component-widget', {type: "begin"}], [
				"component-fields", [
					"component-field", { name: "title" }, attrs.href
				]
			]);
		} else {
			output.push(0);
		}
		return output;
	};
}});

Object.defineProperty(ComponentResource.prototype, "matchDOMTag", { get: function() {
	return { "component-resource": function matchComponentResource(dom) {
		return {
			id: dom.getAttribute('id'),
			href: dom.getAttribute('href'),
			type: dom.getAttribute('type'),
			icon: dom.getAttribute('icon'),
			thumbnail: dom.getAttribute('thumbnail')
		};
	}};
}});



function ComponentWidget(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(ComponentWidget, model.Block);

Object.defineProperty(ComponentWidget.prototype, "attrs", { get: function() {
	return {
		"type": new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(ComponentWidget.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["component-widget", node.attrs];
	};
}});

Object.defineProperty(ComponentWidget.prototype, "matchDOMTag", { get: function() {
	return { "component-widget": function matchComponentWidget(dom) {
		return {
			type: dom.getAttribute('type')
		};
	}};
}});

function ComponentField(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(ComponentField, model.Block);

Object.defineProperty(ComponentField.prototype, "attrs", { get: function() {
	return {
		"name": new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(ComponentField.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["component-field", node.attrs, 0];
	};
}});

Object.defineProperty(ComponentField.prototype, "matchDOMTag", { get: function() {
	return { "component-field": function matchComponentField(dom) {
		return {
			name: dom.getAttribute('name')
		};
	}};
}});


function ComponentFields(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(ComponentFields, model.Block);

Object.defineProperty(ComponentFields.prototype, "attrs", { get: function() {
	return {
		"class": new model.Attribute({ default: "component-fields" })
	};
}});

Object.defineProperty(ComponentFields.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["div", node.attrs, 0];
	};
}});

Object.defineProperty(ComponentFields.prototype, "matchDOMTag", { get: function() {
	return { 'div[class="component-fields"]': null};
}});
