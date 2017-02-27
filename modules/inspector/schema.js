(function(exports) {

var StringType = {
	type: 'string'
};
var OptStringType = {
	type: ['string', 'null']
};

exports.properties = {
	id: OptStringType,
	originalType: Object.assign({default: "none"}, StringType),
	type:  Object.assign({default: "none"}, StringType),
	url: StringType,
	description: OptStringType,
	icon: OptStringType,
	thumbnail: OptStringType,
	size: OptStringType,
	width: OptStringType,
	height: OptStringType,
	duration: OptStringType,
	site: OptStringType,
	html: OptStringType
};

exports.required = ['url'];

})(typeof exports !== "undefined" ? exports : window.Pagecut.modules.inspector.element);
