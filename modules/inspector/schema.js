var Inspector = module.exports = {
	name: 'link',
	group: 'block'
};

var StringType = {
	type: 'string'
};
var OptStringType = {
	type: ['string', 'null']
};

Inspector.properties = {
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

Inspector.required = ['url'];

Inspector.specs = {
	title: "inline<_>*",
	content: "block+"
};

