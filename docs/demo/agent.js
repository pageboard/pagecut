/*
 * GET("/api/endpoint/:id", {id: 12, jwt: myjwt}, cb)
 * GET("/component/test.html", {type: 'html'}, cb)
 * POST("...", query, body, cb)
 */

["HEAD", "GET", "COPY", "PUT", "POST", "DELETE", "PATCH"].forEach(function(method) {
	window[method] = (function(method) { return function(url, query, body, cb) {
		if (!url) throw new Error("Missing url for " + method);
		if (!cb) {
			if (typeof body == "function") {
				cb = body;
				body = null;
			} else if (typeof query == "function") {
				cb = query;
				query = null;
			}
		}
		if (/^(HEAD|GET|COPY|DELETE)$/i.test(method) == false) {
			// give priority to body
			if (!body && query) {
				body = query;
				query = null;
			}
		}
		if (!query) query = {};
		var promise;
		if (!cb) promise = new Promise(function(resolve, reject) {
			cb = function(err, data) {
				if (err) reject(err);
				else resolve(data);
			};
		});
		var opts = {};
		if (url.url) {
			opts = url;
			url = url.url;
		}
		if (typeof url == "string") url = new URL(url, document.location);

		url.pathname = url.pathname.replace(/\/:(\w+)/g, function(str, name) {
			var val = query[name];
			if (val != null) {
				delete query[name];
				return '/' + val;
			} else {
				return '/:' + name;
			}
		});

		var queryStr = Object.keys(query).sort().map(function (key) {
			var val = query[key];
			if (val === undefined) return '';
			if (val === null) return key;
			if (Array.isArray(val)) {
				return val.sort().map(function (val2) {
					return encodeURIComponent(key) + '=' + encodeURIComponent(val2);
				}).join('&');
			}
			return encodeURIComponent(key) + '=' + encodeURIComponent(val);
		}).filter(function (x) {
			return x.length > 0;
		}).join('&');

		if (queryStr) url.search = queryStr;
		url = url.toString();

		var type = opts.type || 'json';
		var accept = opts.accept || [
			'application/json; q=1.0',
			'text/javascript; q=1.0',
			'application/xml; q=0.9',
			'text/xml; q=0.9',
			'text/plain; q=0.8',
			'text/html; q=0.7'
		];
		if (typeof accept != "string" && accept.join) accept = accept.join(',');

		var xhr = new XMLHttpRequest();
		xhr.open(method, url, true);
		xhr.onreadystatechange = function() {
			if (this.readyState == 4) {
				var code = this.status;
				var err;
				if (!code) {
					err = new Error("xhr cancelled " + url);
					err.code = 0;
					return cb(err);
				}
				var response, ex;
				if (this.responseType == "json") {
					try { response = this.response; } catch(e) { ex = e; }
				}
				if (!response) {
					try { response = this.responseXML; } catch(e) { ex = e; }
				}
				if (!response) {
					try { response = JSON.parse(this.responseText); } catch(e) { ex = e; }
				}
				if (!response) {
					response = this.responseText;
				}

				if (code >= 200 && code < 400) {
					cb(null, response);
				} else {
					err = new Error(response || ex || "unreadable response");
					err.code = code;
					cb(err);
				}
			}
		};

		xhr.setRequestHeader('Accept', accept);
		if (type == "html") {
			// response will contain a document
			xhr.responseType = "document";
		}
		if (body) {
			var contentType = {
				text: 'text/plain',
				json: 'application/json',
				xml: 'application/xml',
				html: 'text/html',
				form: 'application/x-www-form-urlencoded',
				multipart: 'multipart/form-data'
			}[type];
			if (contentType) xhr.setRequestHeader('Content-Type', contentType);
			if (type == 'json') body = JSON.stringify(body);
			xhr.send(body);
		} else {
			xhr.send();
		}
		if (promise) return promise;
		else return xhr;
	};})(method);
});

