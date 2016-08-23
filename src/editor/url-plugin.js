const {InputRule, inputRules} = require("prosemirror/dist/inputrules");
const {Plugin} = require("prosemirror/dist/edit");
const {Slice, Fragment} = require("prosemirror/dist/model");

const UrlRegex = require('url-regex');

function UrlPlugin(pm, options) {
	this.action = options.action;
	this.pm = pm;
	this.filter = this.filter.bind(this);
	pm.on.transformPasted.add(this.filter);
}

UrlPlugin.prototype.detach = function(pm) {
	pm.on.transformPasted.remove(this.filter);
};

UrlPlugin.prototype.filter = function(slice) {
	return new Slice(this.transform(slice.content), slice.openLeft, slice.openRight);
};

UrlPlugin.prototype.transform = function(fragment) {
	var linkified = [];
	var urlReg = UrlRegex();
	for (var i = 0; i < fragment.childCount; i++) {
		var child = fragment.child(i);
		if (child.isText) {
			var pos = 0, m;
			while (m = urlReg.exec(child.text)) {
				var start = m.index;
				var end = start + m[0].length;
				var link = child.type.schema.marks.link;
				if (start > 0) linkified.push(child.copy(child.text.slice(pos, start)));
				var urlText = child.text.slice(start, end);
				var newNode = this.action(this.pm, urlText, child);
				if (!newNode) {
					newNode = child.type.create(null, urlText, link ? link.create({href: urlText}).addToSet(child.marks) : null);
				}
				linkified.push(newNode);
				pos = end;
			}
			if (pos < child.text.length) linkified.push(child.copy(child.text.slice(pos)));
		} else {
			linkified.push(child.copy(this.transform(child.content)));
		}
	}
	return Fragment.fromArray(linkified);
};

module.exports = new Plugin(UrlPlugin);

