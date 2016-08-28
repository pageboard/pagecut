var model = require("prosemirror/dist/model");
var inherits = require('./utils/inherits');


/*****************************************/

exports.Item = Item;

function Item(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Item, model.Block);

Object.defineProperty(Item.prototype, "attrs", { get: function() {
	return {
		id: new model.Attribute({ default: "" }),
		type:  new model.Attribute({ default: "none" })
	};
}});

Object.defineProperty(Item.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-item", node.attrs, 0];
	};
}});

Object.defineProperty(Item.prototype, "matchDOMTag", { get: function() {
	return { "edbed-item": function(dom) {
		return {
			id: dom.getAttribute('id'),
			type: dom.getAttribute('type')
		};
	}};
}});


/*****************************************/

exports.Link = Link;

function Link(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Link, model.Block);

Object.defineProperty(Link.prototype, "attrs", { get: function() {
	return {
		href: new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(Link.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-link", node.attrs, 0];
	};
}});

Object.defineProperty(Link.prototype, "matchDOMTag", { get: function() {
	return { "edbed-link": function(dom) {
		return {
			href: dom.getAttribute('href')
		};
	}};
}});


/*****************************************/

exports.Field = Field;

function Field(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Field, model.Block);

Object.defineProperty(Field.prototype, "attrs", { get: function() {
	return {
		"name": new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(Field.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-field", node.attrs, 0];
	};
}});

Object.defineProperty(Field.prototype, "matchDOMTag", { get: function() {
	return { "edbed-field": function(dom) {
		return {
			name: dom.getAttribute('name')
		};
	}};
}});


/*****************************************/

exports.Fields = Fields;

function Fields(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Fields, model.Block);

Object.defineProperty(Fields.prototype, "attrs", { get: function() {
	return {};
}});

Object.defineProperty(Fields.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-fields", node.attrs, 0];
	};
}});

Object.defineProperty(Fields.prototype, "matchDOMTag", { get: function() {
	return { 'edbed-fields': null };
}});


/*****************************************/

exports.Aside = Aside;

function Aside(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Aside, model.Block);

Object.defineProperty(Aside.prototype, "attrs", { get: function() {
	return {};
}});

Object.defineProperty(Aside.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-aside", node.attrs, 0];
	};
}});

Object.defineProperty(Aside.prototype, "matchDOMTag", { get: function() {
	return { 'edbed-aside': null };
}});


/*****************************************/

exports.Thumbnail = Thumbnail;

function Thumbnail(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Thumbnail, model.Block);

Object.defineProperty(Thumbnail.prototype, "attrs", { get: function() {
	return {};
}});

Object.defineProperty(Thumbnail.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-thumbnail", node.attrs, 0];
	};
}});

Object.defineProperty(Thumbnail.prototype, "matchDOMTag", { get: function() {
	return { 'edbed-thumbnail': null };
}});


/*****************************************/

exports.Image = Image;

function Image(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Image, model.Block);

Object.defineProperty(Image.prototype, "attrs", { get: function() {
	return {
		src: new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(Image.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["img", node.attrs];
	};
}});

Object.defineProperty(Image.prototype, "matchDOMTag", { get: function() {
	return { "img": function(dom) {
		return {
			src: dom.getAttribute('src')
		};
	}};
}});

/*****************************************/

exports.Properties = Properties;

function Properties(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Properties, model.Block);

Object.defineProperty(Properties.prototype, "attrs", { get: function() {
	return {};
}});

Object.defineProperty(Properties.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-props", node.attrs, 0];
	};
}});

Object.defineProperty(Properties.prototype, "matchDOMTag", { get: function() {
	return { 'edbed-props': null };
}});


/*****************************************/

exports.Property = Property;

function Property(name, schema) {
	model.Block.call(this, name, schema);
}
inherits(Property, model.Block);

Object.defineProperty(Property.prototype, "attrs", { get: function() {
	return {
		value: new model.Attribute({ default: "" }),
		name:  new model.Attribute({ default: "" })
	};
}});

Object.defineProperty(Property.prototype, "toDOM", { get: function() {
	return function(node) {
		return ["edbed-prop", node.attrs, 0];
	};
}});

Object.defineProperty(Property.prototype, "matchDOMTag", { get: function() {
	return { "edbed-prop": function(dom) {
		return {
			name: dom.getAttribute('name'),
			value: dom.getAttribute('value')
		};
	}};
}});

