var keymap = require("prosemirror-keymap").keymap;

module.exports = function(editor, options) {
	return keymap({
		Enter: breakCommand
	});
};


function breakCommand(state, dispatch, view) {
	var tr = state.tr;
	var sel = tr.selection;
	var bef = sel.$to.nodeBefore;
	if (bef && bef.type.name == "hard_break") {
		if (sel.empty && dispatch) {
			dispatch(
				tr.delete(sel.$to.pos - 1, sel.$to.pos).scrollIntoView()
			);
		}
		// do not split root blocks
		var parent = sel.$to.parent;
		if (parent && parent.type.spec.typeName == "root") return true;
		// fall through
		return false;
	} else {
		if (dispatch) {
			dispatch(
				tr.replaceSelectionWith(state.schema.nodes.hard_break.create()).scrollIntoView()
			);
		}
		// stop here
		return true;
	}
}

