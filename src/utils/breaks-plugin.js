const {Plugin, commands, Keymap} = require("prosemirror/dist/edit");

function BreaksPlugin(pm, options) {
	this.pm = pm;
	this.command = this.command.bind(this);
	pm.addKeymap(new Keymap({
		Enter: this.command
	}, {
		name: "BreaksPlugin"
	}, 0), -1);
}

BreaksPlugin.prototype.command = function(pm) {
	var node = pm.selection.$to.nodeBefore;
	if (!node) return false;
	if (node && node.type.name == "hard_break") {
		commands.deleteCharBefore(pm, true);
		return commands.splitBlock(pm, true);
	} else {
		return pm.tr.replaceSelection(pm.schema.nodes.hard_break.create()).applyAndScroll();
	}
	return true;
};

BreaksPlugin.prototype.detach = function(pm) {
	pm.removeKeymap("BreaksPlugin");
};

module.exports = new Plugin(BreaksPlugin);

