(function(exports) {

var ownDoc = (document._currentScript || document.currentScript).ownerDocument;

exports.inspector.resolver = InspectorResolver;

Object.assign(exports.inspector.element, {
	group: 'block',
	view: InspectorEdit,
	contents: {
		title: {
			spec: "inline<_>*"
		},
		content: {
			spec: "block+"
		}
	}
});

function InspectorResolver(editor, obj, cb) {
	var inspector = editor.modules.inspector;
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
}

function defaultInspector(url, cb) {
	setTimeout(function() {
		cb(null, {url: url, title: url});
	});
}

function InspectorEdit(document, block) {
	var data = block.data;
	var node = document.createElement('div');
	node.setAttribute('class', 'inspector');
	node.setAttribute('block-url', block.url || ""); // block-level attributes must be present event if block is empty
	node.innerHTML = ownDoc.body.innerHTML;
	var link = node.querySelector('header > a[title]');

	link.setAttribute("title", data.site || "");
	if (data.type) node.setAttribute("type", data.type);
	if (data.originalType) node.setAttribute("original-type", data.originalType);
	if (data.url) link.setAttribute("href", data.url);
	if (data.icon) ensure(link, 'img', { src: data.icon });
	if (data.thumbnail) ensure(node.querySelector('figure'), 'img', { src: data.thumbnail });
	if (data.html) ensure(node, 'script', {type: 'text/html'}).textContent = data.html || '';

	var obj = {
		dimensions: formatDimensions(data.width, data.height),
		duration: formatDuration(data.duration),
		size: formatSize(data.size)
	};
	Object.keys(obj).forEach(function(key) {
		var span = document.createElement('span');
		span.setAttribute('title', key);
		span.innerHTML = obj[key] || "";
		obj[key] = span;
	});
	node.querySelector('aside > div > p').innerHTML = data.description || "";

	fill(node.querySelector('aside > div > div'), obj);
	return node;
}

function ensure(parent, tag, atts) {
	var childs = parent.childNodes;
	var r = new RegExp("^" + tag + "$", "i");
	var node, child;
	for (var i=0; i < childs.length; i++) {
		child = childs[i];
		if (child.nodeType == Node.ELEMENT_NODE && r.test(child.nodeName)) {
			node = child;
			break;
		}
	}
	if (!node) {
		node = document.createElement(tag);
		parent.appendChild(node);
	}
	if (atts) Object.keys(atts).forEach(function(key) {
		node.setAttribute(key, atts[key]);
	});
	return node;
}

function fill(parent, props) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		parent.appendChild(val);
	});
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
