	(function( $, app, i18n ) {

	var ui = app.ns("ui");
	var services = app.ns("services");

	ui.ClusterConnect = ui.AbstractWidget.extend({
		defaults: {
			cluster: null
		},
		init: function() {
			this._super();
			this.prefs = services.Preferences.instance();
			this.cluster = this.config.cluster;
			this.el = $.joey(this._main_template());
			this.cluster.get( "", this._node_handler );
		},

		_node_handler: function(data) {
			if(data) {
				this.prefs.set("app-base_uri", this.cluster.base_uri);
				if(data.version && data.version.number)
					this.cluster.setVersion(data.version.number);
			}
		},

		_parseUri: function(base_uri) {
			base_uri = base_uri || "";
			var url = base_uri;
			var args = {};
			var q = base_uri.indexOf("?");
			if(q !== -1) {
				url = base_uri.substring(0, q);
				var argstr = base_uri.substring(q + 1);
				args = argstr.split("&").reduce(function(r, p) {
					if(!p) { return r; }
					var parts = p.split("=");
					r[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || "");
					return r;
				}, {});
			}
			return { url: url, args: args };
		},

		_reconnect_handler: function() {
			var base_uri = this.el.find(".uiClusterConnect-uri").val();
			var parsed = this._parseUri(base_uri);
			// Prefer dedicated form fields; fall back to legacy ?auth_user=&auth_password= in the URI.
			var auth_user = this.el.find(".uiClusterConnect-user").val() || parsed.args["auth_user"] || "";
			var auth_password = this.el.find(".uiClusterConnect-password").val();
			if(auth_password === "" || auth_password == null) {
				auth_password = parsed.args["auth_password"] || "";
			}
			this.prefs.set("app-base_uri", parsed.url);
			this.prefs.set("app-auth_user", auth_user);
			this.prefs.set("app-auth_password", auth_password);
			$("body").empty().append(new app.App("body", { id: "es",
				base_uri: parsed.url,
				auth_user : auth_user,
				auth_password : auth_password
			}));
		},

		_main_template: function() {
			var auth_user = this.prefs.get("app-auth_user") || "";
			var auth_password = this.prefs.get("app-auth_password") || "";
			function onEnter(ev) {
				if(ev.which === 13) {
					ev.preventDefault();
					this._reconnect_handler();
				}
			}
			return { tag: "SPAN", cls: "uiClusterConnect", children: [
				{ tag: "INPUT", type: "text", cls: "uiClusterConnect-uri", onkeyup: onEnter.bind(this), id: this.id("baseUri"), value: this.cluster.base_uri },
				{ tag: "INPUT", type: "text", cls: "uiClusterConnect-user", placeholder: i18n.text("Header.AuthUser") || "Username", title: i18n.text("Header.AuthUser") || "Username", onkeyup: onEnter.bind(this), id: this.id("authUser"), value: auth_user },
				{ tag: "INPUT", type: "password", cls: "uiClusterConnect-password", placeholder: i18n.text("Header.AuthPassword") || "Password", title: i18n.text("Header.AuthPassword") || "Password", onkeyup: onEnter.bind(this), id: this.id("authPassword"), value: auth_password },
				{ tag: "BUTTON", type: "button", text: i18n.text("Header.Connect"), onclick: this._reconnect_handler }
			]};
		}
	});

})( this.jQuery, this.app, this.i18n );
