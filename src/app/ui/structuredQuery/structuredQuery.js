(function( $, app, i18n ) {

	var ui = app.ns("ui");
	var data = app.ns("data");

	var StructuredQuery = ui.AbstractWidget.extend({
		defaults: {
			cluster: null  // (required) instanceof app.services.Cluster
		},
		_baseCls: "uiStructuredQuery",
		init: function(parent) {
			this._super();
			this.selector = new ui.IndexSelector({
				onIndexChanged: this._indexChanged_handler,
				cluster: this.config.cluster
			});
			this.el = $(this._main_template());
			this.out = this.el.find("DIV.uiStructuredQuery-out");
			this.attach( parent );
		},
		
		_indexChanged_handler: function( index ) {
			this.filter && this.filter.remove();
			this.filter = new ui.FilterBrowser({
				cluster: this.config.cluster,
				index: index,
				onStartingSearch: function() { this.el.find("DIV.uiStructuredQuery-out").text( i18n.text("General.Searching") ); this.el.find("DIV.uiStructuredQuery-src").hide(); }.bind(this),
				onSearchSource: this._searchSource_handler,
				onResults: this._results_handler
			});
			this.el.find(".uiStructuredQuery-body").append(this.filter);
		},
		
		_results_handler: function( filter, event ) {
			if(! event || ! event.data) {
				this.el.find("DIV.uiStructuredQuery-out").text( i18n.text("Query.FailAndUndo") || "Query failed" );
				return;
			}
			var typeMap = {
				"json": this._jsonResults_handler,
				"table": this._tableResults_handler,
				"csv": this._csvResults_handler
			};
			var handler = typeMap[ event.type ] || this._jsonResults_handler;
			handler.call( this, event.data, event.metadata );
		},
		_jsonResults_handler: function( results ) {
			this.el.find("DIV.uiStructuredQuery-out").empty().append( new ui.JsonPretty({ obj: results }));
		},
		_csvResults_handler: function( results ) {
			this.el.find("DIV.uiStructuredQuery-out").empty().append( new ui.CSVTable({ results: results }));
		},
		_tableResults_handler: function( results, metadata ) {
			if(! results || ! results.hits) {
				this.el.find("DIV.uiStructuredQuery-out").text( i18n.text("Query.FailAndUndo") || "Query failed" );
				return;
			}
			// hack up a QueryDataSourceInterface so that StructuredQuery keeps working without using a Query object
			var q = new data.Query();
			var sorts = this.filter && this.filter.getCurrentSort && this.filter.getCurrentSort();
			if(sorts && sorts.length) {
				q.search.sort = sorts.map(function(s) {
					var sortd = {};
					sortd[s.field] = { order: s.order || "desc" };
					return sortd;
				});
			}
			var qdi = new data.QueryDataSourceInterface({ metadata: metadata, query: q });
			var tab = new ui.Table( {
				store: qdi,
				height: 400,
				width: this.out.innerWidth(),
				onHeaderClick: this._changeSort_handler
			} ).attach(this.out.empty());
			qdi._results_handler(q, results);
		},

		_changeSort_handler: function( table, wEv ) {
			if(! this.filter) { return; }
			this.filter.setSortFromHeader(wEv.column, wEv.dir);
			this.filter.search();
		},
		
		_showRawJSON : function() {
			if($("#rawJsonText").length === 0) {
				var hiddenButton = $("#showRawJSON");
				var jsonText = $({tag: "P", type: "p", id: "rawJsonText"});
				jsonText.text(hiddenButton[0].value);
				hiddenButton.parent().append(jsonText);
			}
		},
		
		_searchSource_handler: function(src) {
			var searchSourceDiv = this.el.find("DIV.uiStructuredQuery-src");
			searchSourceDiv.empty().append(new app.ui.JsonPretty({ obj: src }));
			if(typeof JSON !== "undefined") {
				var showRawJSON = $({ tag: "BUTTON", type: "button", text: i18n.text("StructuredQuery.ShowRawJson"), id: "showRawJSON", value: JSON.stringify(src), onclick: this._showRawJSON });
				searchSourceDiv.append(showRawJSON);
			}
			searchSourceDiv.show();
		},
		
		_main_template: function() {
			return { tag: "DIV", cls: this._baseCls, children: [
				this.selector,
				{ tag: "DIV", cls: "uiStructuredQuery-body" },
				{ tag: "DIV", cls: "uiStructuredQuery-src", css: { display: "none" } },
				{ tag: "DIV", cls: "uiStructuredQuery-out" }
			]};
		}
	});

	ui.StructuredQuery = ui.Page.extend({
		init: function() {
			this.q = new StructuredQuery( this.config );
			this.el = this.q.el;
		}
	});

})( this.jQuery, this.app, this.i18n );
