module.exports = class Element {
	constructor(elt) {
		Object.assign(this, elt);
		if (!elt.contents || !elt.contents.list) {
			this.contents = new Contents(elt.contents);
		}
	}
	create(obj) {
		obj = Object.assign({}, obj);
		obj.type = this.name;
		if (this.standalone) obj.standalone = true;
		return obj;
	}
	clone() {
		var el = new Element(this);
		Object.keys(this).forEach((key) => {
			var val = this[key];
			if (Array.isArray(val)) el[key] = val.slice();
		});
		el.contents = el.contents.clone();
		return el;
	}
	get leaf() {
		return this.contents.list.length == 0;
	}
};

class Contents {
	constructor(list) {
		if (!list) list = [];
		else if (typeof list == "string") list = [{nodes: list}];
		else if (!Array.isArray(list)) list = [list];
		this.list = list;
		if (this.list.length == 1 && this.list[0].id == null) this.unnamed = true;
	}
	get(block, name) {
		if (name == null && !this.unnamed) throw new Error("Missing name parameter");
		if (!block.content) return;
		if (!name) {
			if (block.content[""] !== undefined) name = '';
			else name = Object.keys(block.content)[0];
		}
		return block.content[name];
	}
	set(block, name, val) {
		if (val === undefined && name && typeof name != "string" && name.getAttribute) {
			val = name;
			name = name.getAttribute('block-content');
		}
		if (name == null && !this.unnamed) throw new Error("Missing name parameter");
		if (!block.content) block.content = {};
		block.content[name || ""] = val;
	}
	clear(block, name) {
		if (name == null && !this.unnamed) throw new Error("Missing name parameter");
		if (block.content) {
			delete block.content[name || ""];
		}
	}
	each(block, fn) {
		this.list.forEach((def) => {
			var content = this.get(block, def.id);
			if (content != null) fn(content, def);
		});
	}
	find(name) {
		return this.list.find((def) => {
			return !def.id || def.id == name;
		});
	}
	get firstId() {
		return this.list.length == 1 ? this.list[0].id : null;
	}
	normalize(block) {
		var content = block.content;
		if (content && this.unnamed) {
			var name = Object.keys(content)[0];
			if (name) {
				content[""] = content[name];
				delete content[name];
			}
			if (Object.keys(content).length != 1) console.warn("Failed to normalize block", block);
		}
		return block;
	}
	clone() {
		return new Contents(this.list.slice().map((obj) => Object.assign({}, obj)));
	}
}
