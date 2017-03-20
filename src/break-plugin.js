var keymap = require("prosemirror-keymap").keymap;

module.exports = function(main, options) {
	return keymap({
		Enter: breakCommand
	});
};


function breakCommand(state, dispatch, view) {
	var sel = state.tr.selection;
	var bef = sel.$to.nodeBefore;
	if (bef && bef.type.name == "hard_break") {
		if (sel.empty && dispatch) {
			dispatch(state.tr.delete(sel.$to.pos - 1, sel.$to.pos).scrollIntoView());
		}
		// do not split root blocks
		var parent = sel.$to.parent;
		if (parent && parent.type.spec.typeName == "root") return true;
		// fall through
		return false;
	} else {
		if (dispatch) dispatch(state.tr.replaceSelectionWith(state.schema.nodes.hard_break.create()).scrollIntoView());
		// stop here
		return true;
	}
}

