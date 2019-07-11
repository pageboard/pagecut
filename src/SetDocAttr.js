const { Step, StepResult } = require('prosemirror-transform');

module.exports = class SetDocAttr extends Step {
	constructor(key, value, stepType = 'SetDocAttr') {
		super();
		this.stepType = stepType;
		this.key = key;
		this.value = value;
	}
	apply(doc) {
		this.prevValue = doc.attrs[this.key];
		if (doc.attrs == doc.type.defaultAttrs) doc.attrs = Object.assign({}, doc.attrs);
		doc.attrs[this.key] = this.value;
		return StepResult.ok(doc);
	}
	invert() {
		return new SetDocAttr(this.key, this.prevValue, 'revertSetDocAttr');
	}
	map() {
		return null;
	}
	toJSON() {
		return {
			stepType: this.stepType,
			key: this.key,
			value: this.value,
		};
	}
	static fromJSON(json) {
		return new SetDocAttr(json.key, json.value, json.stepType);
	}
};

