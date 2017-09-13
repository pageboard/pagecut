(function(exports) {

exports.inspector = InspectorModule;

var StringType = {
	type: 'string'
};
var OptStringType = {
	type: ['string', 'null']
};

var inspectorElement = {
	name: 'inspector',
	render: inspectorRender,
	group: 'block',
	contents: {
		title: {
			spec: "inline*"
		},
		content: {
			spec: "block+"
		}
	},
	properties: {
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
	},
	required: ['url']
};

function InspectorModule(editor) {
	this.editor = editor;
	editor.elementsMap.inspector = inspectorElement;
//	editor.resolvers.push(this.resolver.bind(this)); // TODO re-enable resolvers when id module is embedded
	this.store = {};
}

// this is exposed for clients, pagecut does not know about this interface
InspectorModule.prototype.store = {};
InspectorModule.prototype.get = function(url) {
	return this.store[url];
};
InspectorModule.prototype.set = function(blocks) {
	if (blocks && blocks.data) blocks = [blocks];
	for (var i = 0; i < blocks.length; i++) {
		this.store[blocks[i].url] = blocks[i];
	}
};

InspectorModule.prototype.resolver = function(editor, obj, cb) {
	var inspector = this;
	var url = obj.url || obj.node && obj.node.getAttribute('block-url');
	if (!url) return;
	var block = inspector.get(url);
	if (block) return block;
	var block = {
		type: 'inspector',
		url: url,
		data: {
			type: 'none'
		},
		content: {
			title: url
		}
	};
	inspector.set(block);
	(inspector.inspect || defaultInspector)(url, function(err, info) {
		if (err) return cb(err);
		var block = {
			type: 'inspector',
			url: url,
			data: info,
			content: {
				title: info.title
			}
		};
		inspector.set(block);
		cb(null, block);
	});
	return block;
};

function defaultInspector(url, cb) {
	setTimeout(function() {
		cb(null, {url: url, title: url});
	});
}

function inspectorRender(doc, block) {
	var data = block.data;
	var node = doc.dom`<div class="inspector"
		block-url="${block.url}"
		type="${data.type}"
		original-type="${data.originalType}"
	>
		<header draggable>
			<a name="type"></a>
			<a title="${data.site}" target="_blank" href="${data.url}">${getImg(doc, data.icon)}</a>
			<a name="preview"></a>
		</header>
		<div>
			<div block-content="title"></div>
			<div block-content="content"></div>
		</div>
		<aside>
			<div>
				<div>
					<span title="dimensions">${formatDimensions(data.width, data.height)}</span>
					<span title="duration">${formatDuration(data.duration)}</span>
					<span title="size">${formatSize(data.size)}</span>
				</div>
				<p>${data.description}</p>
			</div>
			<figure>${getImg(doc, data.thumbnail)}</figure>
		</aside>
	</div>`;
	return node;
}

function getImg(doc, url) {
	if (!url) return;
	return doc.dom`<img src="${url}" />`;
}

function formatDimensions(w, h) {
	if (!w) return;
	if (!h) return w + 'px';
	return w + 'x' + h;
}

function formatDuration(d) {
	return d;
}

function formatSize(s) {
	if (!s) return;
	return Math.round(s / 1000) + "KB";
}

})(window.Pagecut.modules);
