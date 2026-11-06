(function( $, app ) {

	var services = app.ns("services");
	var ux = app.ns("ux");

	function parse_version( v ) {
		return v.match(/^(\d+)\.(\d+)\.(\d+)/).slice(1,4).map( function(d) { return parseInt(d || 0, 10); } );
	}

	services.Cluster = ux.Class.extend({
		defaults: {
			base_uri: null
		},
		// Local dynamic proxy (see proxy/esProxy.js): the browser only ever talks
		// same-origin to /es/, and the real Elasticsearch base URI the user typed
		// is forwarded per-request as the X-ES-Target header. This solves CORS
		// without baking in a fixed cluster address.
		proxyPrefix: "/es/",
		proxyTargetHeader: "X-ES-Target",
		target: null,
		init: function() {
			this.base_uri = this.config.base_uri;
			this.target = this.config.target || this.config.base_uri;
			this.onerror = this.config.onerror;
		},
		setVersion: function( v ) {
			this.version = v;
			this._version_parts = parse_version( v );
		},
		versionAtLeast: function( v ) {
			var testVersion = parse_version( v );
			for( var i = 0; i < 3; i++ ) {
				if( testVersion[i] !== this._version_parts[i] ) {
					return testVersion[i] < this._version_parts[i];
				}
			}
			return true;
		},
		// Return { url, headers } that routes through the local dynamic proxy
		// for absolute Elasticsearch URLs, and is a passthrough otherwise.
		proxyUrl: function(rawUrl) {
			var target = this.target || this.base_uri;
			var headers = {};
			if(rawUrl == null) return { url: rawUrl, headers: headers };
			var url = String(rawUrl);
			// Already going through our own proxy / same-origin relative path?
			if(url.indexOf(this.proxyPrefix) === 0 || url.charAt(0) === "/") {
				return { url: url, headers: headers };
			}
			// Absolute URL: route it through /es/ so the browser stays
			// same-origin and the proxy adds CORS / forwards to the target.
			// If the URL itself is the same origin as the page (plugin mode,
			// i.e. head served from inside Elasticsearch) keep it direct.
			if(/^https?:\/\//i.test(url)) {
				if(url.indexOf(window.location.origin) === 0) {
					return { url: url, headers: headers };
				}
				var rest = url.replace(/^https?:\/\/[^\/]*/, "");
				if(rest.charAt(0) !== "/") rest = "/" + rest;
				// If the proxied base has a non-root path, it is part of the target
				// (e.g. https://host/prefix) and must not be duplicated.
				var targetPath = "";
				try {
					var u = new URL(target);
					targetPath = u.pathname.replace(/\/+$/, "");
				} catch(e) { /* target without scheme is normalized server-side */ }
				if(targetPath && rest.indexOf(targetPath + "/") === 0) {
					rest = rest.slice(targetPath.length);
				}
				if(target) {
					headers[this.proxyTargetHeader] = target;
				}
				return { url: this.proxyPrefix + rest.replace(/^\//, ""), headers: headers };
			}
			return { url: url, headers: headers };
		},
		request: function( params ) {
			params = params || {};
			var self = this;
			var proxied = this.proxyUrl(params.url != null ? params.url : (this.base_uri || "") + params.path);
			var userError = params.error;
			var userSuccess = params.success;
			// Params supplied directly (AnyRequest) may already carry a url;
			// keep them but rewrite absolute URLs through the proxy.
			if(params.url != null && params.error == null && params.success == null) {
				return $.ajax( $.extend({
					url: proxied.url,
					headers: proxied.headers,
					contentType: "application/json",
					dataType: "json",
				}, params, { url: proxied.url, headers: proxied.headers } ) );
			}
			return $.ajax( $.extend({
				url: proxied.url,
				headers: proxied.headers,
				contentType: "application/json",
				dataType: "json",
				error: function(xhr, type, message) {
					try {
						var data = xhr && xhr.responseJSON;
						if(! data && xhr && xhr.responseText) data = JSON.parse(xhr.responseText);
						if(data && (data.error || data.reason || data.status)) {
							if(self.onerror) self.onerror(xhr);
						}
					} catch(e) { /* not json */ }
					if("console" in window) {
						console.log({ "XHR Error": type, "message": message });
					}
					if(userError) return userError.apply(null, arguments);
				},
				success: function(data) {
					if(data && data.error && data.status && arguments.length > 2) {
						if(self.onerror && arguments[0] && typeof arguments[0] === "object") self.onerror({ responseJSON: arguments[0] });
						if(userError) return userError.apply(null, arguments);
					}
					if(userSuccess) return userSuccess.apply(null, arguments);
				}
			},  params, { url: proxied.url, headers: proxied.headers } ) );
		},
		"get": function(path, success, error) { return this.request( { type: "GET", path: path, success: success, error: error } ); },
		"post": function(path, data, success, error) { return this.request( { type: "POST", path: path, data: data, success: success, error: error } ); },
		"put": function(path, data, success, error) { return this.request( { type: "PUT", path: path, data: data, success: success, error: error } ); },
		"delete": function(path, data, success, error) { return this.request( { type: "DELETE", path: path, data: data, success: success, error: error } ); }
	});

})( this.jQuery, this.app );
