module.exports = CoLink;

function CoLink(options) {
	this.name = "link";
	this.dataSpec = {
		id: "",
		type:  "none",
		url: "",
		description: "",
		icon: "",
		thumbnail: "",
		size: "",
		width: "",
		height: "",
		duration: "",
		site: "",
		html: ""
	};
	this.contentSpec = {
		title: "inline<_>*",
		content: "block+"
	};

	if (options.inspector) this.inspector = options.inspector;
}

CoLink.prototype.init = function(coed) {
	this.coed = coed;
	// coed.view.content.addEventListener('click', function(e) {
	// 	var target = e.target;
	// 	var root = target.closest('co-link');
	// 	if (!root) return;
	// 	if (!target.closest('[name="preview"]')) return;
	// 	e.preventDefault();
	// 	var data = this.from(root);
	// 	console.log("will preview", data);
	// }.bind(this));
};

CoLink.prototype.inspector = function(info, cb) {
	setTimeout(function() {
		info = Object.assign({}, info);
		info.type = 'link';
		cb(null, info);
	});
};

CoLink.prototype.ensure = function(parent, tag, atts) {
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
};

CoLink.prototype.fill = function(parent, props) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		parent.appendChild(val);
	});
};

CoLink.prototype.formatDimensions = function(w, h) {
	if (!w) return;
	if (!h) return w + 'px';
	return w + 'x' + h;
};

CoLink.prototype.parseDimensions = function(obj, dim) {
	if (!dim) return;
	if (/px$/.test(dim)) {
		obj.width = parseInt(dim);
	} else if (/^\d+x\d+$/.test(dim)) {
		dim = dim.split('x');
		obj.width = parseInt(dim[0]);
		obj.height = parseInt(dim[1]);
	}
};

CoLink.prototype.formatDuration = function(d) {
	return d;
};

CoLink.prototype.formatSize = function(s) {
	if (!s) return;
	return Math.round(s / 1000) + "KB";
};

CoLink.prototype.parseSize = function(obj, s) {
	if (!s) return;
	if (/^\d+KB$/.test(s)) obj.size = parseInt(s) * 1000;
};

CoLink.prototype.to = function(data) {
	var me = this;
	var node = document.createElement('co-link');
	node.innerHTML = '<header><a name="type"></a><a title="" target="_blank"></a><a name="preview"></a></header><div>\
<div content-name="title"></div><div content-name="content"></div>\
</div><aside><div><div></div><p></p></div><figure></figure></aside><script type="text/html"></script>';
	var link = node.querySelector('header > a[title]');

	link.setAttribute("title", data.site || "");
	if (data.type) node.setAttribute("type", data.type);
	if (data.id) node.setAttribute("id", data.id);
	if (data.url) link.setAttribute("href", data.url);
	if (data.icon) me.ensure(link, 'img', { src: data.icon });
	if (data.thumbnail) me.ensure(node.querySelector('figure'), 'img', { src: data.thumbnail });
	if (data.html) me.ensure(node, 'script', {type: 'text/html'}).textContent = data.html || '';

	var obj = {
		dimensions: me.formatDimensions(data.width, data.height),
		duration: me.formatDuration(data.duration),
		size: me.formatSize(data.size)
	};
	Object.keys(obj).forEach(function(key) {
		var span = document.createElement('span');
		span.setAttribute('title', key);
		span.innerHTML = obj[key] || "";
		obj[key] = span;
	});
	node.querySelector('aside > div > p').innerHTML = data.description || "";

	me.fill(node.querySelector('aside > div > div'), obj);

	return node;
};

CoLink.prototype.from = function(node) {
	var me = this;
	var data = {};
	data.type = node.getAttribute('type') || 'none';
	data.id = node.getAttribute('id') || undefined;

	var link = node.querySelector("header > a[href]");
	if (link) {
		data.url = link.getAttribute('href');
		data.site = link.getAttribute('title');
		var icon = link.querySelector("img");
		if (icon) data.icon = icon.getAttribute('src');
	}
	var html = node.querySelector('script[type="text/html"]');
	if (html) data.html = html.textContent;
	var thumb = node.querySelector('aside > figure > img');
	if (thumb) {
		data.thumbnail = thumb.getAttribute('src');
	}
	var i;
	var asides = node.querySelectorAll('aside > div > span');
	var aside, title, val;
	for (i=0; i < asides.length; i++) {
		aside = asides.item(i);
		title = aside.getAttribute('title');
		val = aside.innerHTML;
		if (title == 'size') me.parseSize(data, val);
		else if (title == 'dimensions') me.parseDimensions(data, val);
		else data[title] = val;
	}
	var description = node.querySelector('aside > div > p');
	if (description) data.description = description.innerHTML;
	return data;
};

CoLink.prototype.input = function(node) {
	var me = this;
	var coed = this.coed;

	var loadingId = 'id-colink-' + Date.now();

	var info = {};

	if (typeof node == "string") {
		info.title = node;
		info.url = node;
	} else {
		info.title = node.innerText;
		info.fragment = node;
	}

	function parseDom(schema, node) {
		var schemaSpec = { nodes: Object.assign({}, schema.nodeSpec) };
		schemaSpec.nodes.doc = Object.assign({}, schema.nodeSpec.doc);
		schemaSpec.nodes.doc.content = "root_link";

		var div = document.createElement("div");
		div.appendChild(node);

		var newNode = coed.model.DOMParser.fromSchema(new coed.model.Schema(schemaSpec)).parse(dom);
		return newNode.firstChild;
	}

	me.inspector(info, function(err, props) {
		var oldnode = document.getElementById(loadingId);
		if (!oldnode) {
			return;
		}
		var state = coed.view.state;
		var pos = coed.posFromDOM(oldnode);
		var begin = pos.pos;
		var $pos = state.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;
		var Transform = coed.transform.Transform;

		if (err) {
			console.error(err);
			state.applyAction({
				type: "transform",
				transform: new Transform(state.doc).delete(begin, end)
			});
			return;
		}
		var dom = me.to(props);
		dom.querySelector('[content-name="title"]').innerHTML = props.title;
		state.applyAction({
			type: "transform",
			transform: new Transform(state.doc).replaceWith(begin, end, parseDom(state, dom))
		});
	});

	var loadingNode = me.to({
		type: "none",
		id: loadingId
	});
	loadingNode.querySelector('[content-name="title"]').innerHTML = info.title;

	return parseDom(state, loadingNode);
}

CoLink.prototype.output = function(data, content) {
	if (data.type == "link") {
		var anchor = document.createElement('a');
		anchor.href = data.url;
		anchor.setAttribute('title', content.title.innerHTML);
		anchor.innerHTML = content.content.innerHTML;
		return anchor;
	} else if (data.html) {
		var div = document.createElement('div');
		for (var k in data) {
			if (k == 'html') continue;
			div.setAttribute('data-' + k, data[k]);
		}
		div.innerHTML = data.html;
		return div;
	} else {
		return this.to(data);
	}
};
