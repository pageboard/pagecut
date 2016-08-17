var model = require("prosemirror/dist/model");
var edit = require("prosemirror/dist/edit");

var inherits = require('./inherits');

exports.ComponentResource = ComponentResource;
exports.ComponentWidget = ComponentWidget;

function ComponentResource(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(ComponentResource, model.Block);

Object.defineProperty(ComponentResource.prototype, "attrs", { get: function() {
	return {
		"href": new model.Attribute({ default: "" }),
		"type":  new model.Attribute({ default: "none" }),
		"title": new model.Attribute({ default: "" }),
		"thumbnail": new model.Attribute({ default: "" }),
		"description": new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(ComponentResource.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["component-resource", node.attrs, 0];
	};
}});

Object.defineProperty(ComponentResource.prototype, "matchDOMTag", { get: function() {
	return function(node) {
		return {"component-resource": null};
	};
}});



function ComponentWidget(name, schema) {
	model.Inline.call(this, name, schema);
}
inherits(ComponentWidget, model.Inline);


Object.defineProperty(ComponentWidget.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["component-widget", node.attrs];
	};
}});

Object.defineProperty(ComponentWidget.prototype, "matchDOMTag", { get: function() {
	return function(node) {
		return {"component-widget": null};
	};
}});

