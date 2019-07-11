const Menu = require("prosemirror-menu");

module.exports = Menubar;

Menubar.Menu = Menu;

function Menubar(opts) {
	this.place = opts.place;
	this.items = opts.items;
}

Menubar.prototype.update = function(view) {
	this.place.textContent = "";
	this.place.classList.add('ProseMirror-menu');
	var doc = this.place.ownerDocument;
	this.place.appendChild(doc.adoptNode(Menu.renderGrouped(view, this.items)));
};

