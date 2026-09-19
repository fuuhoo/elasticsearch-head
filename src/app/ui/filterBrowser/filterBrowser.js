(function( $, app, i18n ) {

	var ui = app.ns("ui");
	var data = app.ns("data");
	var ut = app.ns("ut");

	ui.FilterBrowser = ui.AbstractWidget.extend({
		defaults: {
			cluster: null,  // (required) instanceof app.services.Cluster
			index: "" // (required) name of the index to query
		},

		init: function(parent) {
			this._super();
			this._cluster = this.config.cluster;
			this.el = $(this._main_template());
			this.filtersEl = this.el.find(".uiFilterBrowser-filters");
			this.sortRowsEl = this.el.find(".uiFilterBrowser-sortRows");
			this.attach( parent );
			// one default sort row so multi-sort UI is usable before metadata arrives
			if(this.sortRowsEl && this.sortRowsEl.length && !this.sortRowsEl.children().length) {
				this.sortRowsEl.append(this._sortRow_template());
			}
			new data.MetaDataFactory({ cluster: this._cluster, onReady: function(metadata, eventData) {
				this.metadata = metadata;
				this._createFilters_handler(eventData.originalData.metadata.indices);
			}.bind(this) });
		},

		_createFilters_handler: function(data) {
			var filters = [];
			function scan_properties(path, obj) {
				if (obj.properties) {
					for (var prop in obj.properties) {
						scan_properties(path.concat(prop), obj.properties[prop]);
					}
				} else {
					// handle multi_field 
					if (obj.fields) {
						for (var subField in obj.fields) {
							filters.push({ path: (path[path.length - 1] !== subField) ? path.concat(subField) : path, type: obj.fields[subField].type, meta: obj.fields[subField] });
						}
					}
					filters.push({ path: path, type: obj.type, meta: obj });
				}
			}
			if (data[this.config.index]){
				for(var type in data[this.config.index].mappings) {
					scan_properties([type], data[this.config.index].mappings[type]);
				}
			}

			filters.sort( function(a, b) {
				var x = a.path.join(".");
				var y = b.path.join(".");
				return (x < y) ? -1 : (x > y) ? 1 : 0;
			});

			this.filters = [
				{ path: ["match_all"], type: "match_all", meta: {} },
				{ path: ["_all"], type: "_all", meta: {}}
			].concat(filters);

			// Always add the query row first so a sort-UI failure cannot hide basic query.
			this._addFilterRow_handler();
			try {
				if(!this.sortRowsEl.children().length) {
					this.sortRowsEl.append(this._sortRow_template());
				}
				this._populateSortFields();
			} catch(e) {
				if(window.console && console.warn) { console.warn("FilterBrowser sort fields", e); }
			}
		},

		_sortFieldOptions: function() {
			var options = [
				{ value: "_score", text: i18n.text("FilterBrowser.SortNone") || "Default (_score)" },
				{ value: "_id", text: "_id" }
			];
			var seen = { "_score": true, "_id": true };
			(this.filters || []).forEach(function(f) {
				if(!f || !f.path || f.path[0] === "match_all" || f.path[0] === "_all") { return; }
				var name = f.path.length > 1 ? f.path.slice(1).join(".") : f.path[0];
				if(name && ! seen[name]) {
					seen[name] = true;
					options.push({ value: name, text: name });
				}
			});
			return options;
		},

		_fillSortSelect: function(sel, current) {
			if(!sel) { return; }
			var options = this._sortFieldOptions();
			current = current || sel.value || "_score";
			while(sel.options.length) { sel.remove(0); }
			options.forEach(function(o) {
				var opt = document.createElement("option");
				opt.value = o.value;
				opt.text = o.text || o.value;
				sel.appendChild(opt);
			});
			// keep unknown values (e.g. from header click) available
			var found = false;
			for(var i = 0; i < sel.options.length; i++) {
				if(sel.options[i].value === current) { found = true; break; }
			}
			if(! found && current) {
				var extra = document.createElement("option");
				extra.value = current;
				extra.text = current;
				sel.appendChild(extra);
			}
			sel.value = current || "_score";
		},

		_populateSortFields: function() {
			var self = this;
			this.el.find(".uiFilterBrowser-sortRow").each(function(i, row) {
				var fieldSel = $(row).find(".uiFilterBrowser-sortField")[0];
				var orderSel = $(row).find(".uiFilterBrowser-sortOrder")[0];
				self._fillSortSelect(fieldSel, fieldSel && fieldSel.value);
				if(orderSel && ! orderSel.value) { orderSel.value = "desc"; }
			});
		},

		_addSortRow_handler: function() {
			this.sortRowsEl.append(this._sortRow_template());
			try { this._populateSortFields(); } catch(e) {}
		},

		_removeSortRow_handler: function(jEv) {
			$(jEv.target).closest(".uiFilterBrowser-sortRow").remove();
			if(this.sortRowsEl.children().length === 0) {
				this.sortRowsEl.append(this._sortRow_template());
				try { this._populateSortFields(); } catch(e) {}
			}
		},

		search: function() {
			this._search_handler();
		},

		getCurrentSort: function() {
			var sorts = [];
			this.el.find(".uiFilterBrowser-sortRow").each(function(i, row) {
				var field = $(row).find(".uiFilterBrowser-sortField").val();
				var order = $(row).find(".uiFilterBrowser-sortOrder").val() || "desc";
				if(field && field !== "_score") {
					sorts.push({ field: field, order: order });
				}
			});
			return sorts.length ? sorts : null;
		},

		setSortFromHeader: function(column, currentDir) {
			if(!column) { return; }
			var order = (currentDir === "desc") ? "asc" : (currentDir === "asc") ? "desc" : "desc";
			var existing = null;
			this.el.find(".uiFilterBrowser-sortRow").each(function(i, row) {
				var sel = $(row).find(".uiFilterBrowser-sortField")[0];
				if(sel && sel.value === column) { existing = row; return false; }
			});
			if(existing) {
				var orderSel = $(existing).find(".uiFilterBrowser-sortOrder")[0];
				if(orderSel) { orderSel.value = order; }
				return;
			}
			// put clicked column into the first empty/default row, otherwise append a new row
			var target = null;
			this.el.find(".uiFilterBrowser-sortRow").each(function(i, row) {
				var sel = $(row).find(".uiFilterBrowser-sortField")[0];
				if(sel && (!sel.value || sel.value === "_score")) { target = row; return false; }
			});
			if(!target) {
				this.sortRowsEl.append(this._sortRow_template());
				target = this.sortRowsEl.children(".uiFilterBrowser-sortRow:last")[0];
			}
			var fieldSel = $(target).find(".uiFilterBrowser-sortField")[0];
			var orderSel = $(target).find(".uiFilterBrowser-sortOrder")[0];
			this._fillSortSelect(fieldSel, column);
			if(orderSel) { orderSel.value = order; }
		},
		
		_addFilterRow_handler: function() {
			this.filtersEl.append(this._filter_template());
		},
		
		_removeFilterRow_handler: function(jEv) {
			$(jEv.target).closest("DIV.uiFilterBrowser-row").remove();
			if(this.filtersEl.children().length === 0) {
				this._addFilterRow_handler();
			}
		},
		
		_search_handler: function() {
			var search = new data.BoolQuery();
			search.setSize( this.el.find(".uiFilterBrowser-outputSize").val() )
			var sortList = this.getCurrentSort();
			if(sortList) {
				search.setSortList(sortList);
			}
			this.fire("startingSearch");
			this.filtersEl.find(".uiFilterBrowser-row").each(function(i, row) {
				row = $(row);
				var bool = row.find(".bool").val();
				var field = row.find(".field").val();
				var op = row.find(".op").val();
				var value = {};
				if(field === "match_all") {
					op = "match_all";
				} else if(op === "range") {
					var lowqual = row.find(".lowqual").val(),
						highqual = row.find(".highqual").val();
					if(lowqual.length) {
						value[row.find(".lowop").val()] = lowqual;
					}
					if(highqual.length) {
						value[row.find(".highop").val()] = highqual;
					}
				} else if(op === "fuzzy") {
					var qual = row.find(".qual").val(),
						fuzzyqual = row.find(".fuzzyqual").val();
					if(qual.length) {
						value["value"] = qual;
					}
					if(fuzzyqual.length) {
						value[row.find(".fuzzyop").val()] = fuzzyqual;
					}
				} else {
					value = row.find(".qual").val();
				}
				search.addClause(value, field, op, bool);
			});
			if(this.el.find(".uiFilterBrowser-showSrc").attr("checked")) {
				this.fire("searchSource", search.search);
			}
			this._cluster.post( this.config.index + "/_search", search.getData(), this._results_handler );
		},
		
		_results_handler: function( data ) {
			var type = this.el.find(".uiFilterBrowser-outputFormat").val();
			this.fire("results", this, { type: type, data: data, metadata: this.metadata });
		},
		
		_changeQueryField_handler: function(jEv) {
			var select = $(jEv.target);
			var spec = select.children(":selected").data("spec") || { type: "string" };
			select.siblings().remove(".op,.qual,.range,.fuzzy");
			var ops = [];
			if(spec.type === 'match_all') {
			} else if(spec.type === '_all') {
				ops = ["query_string"];
			} else if(spec.type === 'string' || spec.type === 'text' || spec.type === 'keyword') {
				ops = ["match", "term", "wildcard", "prefix", "fuzzy", "range", "query_string", "text", "missing"];
			} else if(spec.type === 'long' || spec.type === 'integer' || spec.type === 'float' ||
					spec.type === 'byte' || spec.type === 'short' || spec.type === 'double') {
				ops = ["term", "range", "fuzzy", "query_string", "missing"];
			} else if(spec.type === 'date') {
				ops = ["term", "range", "fuzzy", "query_string", "missing"];
			} else if(spec.type === 'geo_point') {
				ops = ["missing"];
			} else if(spec.type === 'ip') {
				ops = ["term", "range", "fuzzy", "query_string", "missing"];
			} else if(spec.type === 'boolean') {
				ops = ["term"]
			}
			select.after({ tag: "SELECT", cls: "op", onchange: this._changeQueryOp_handler, children: ops.map(ut.option_template) });
			select.next().change();
		},
		
		_changeQueryOp_handler: function(jEv) {
			var op = $(jEv.target), opv = op.val();
			op.siblings().remove(".qual,.range,.fuzzy");
			if(opv === 'match' || opv === 'term' || opv === 'wildcard' || opv === 'prefix' || opv === "query_string" || opv === 'text') {
				op.after({ tag: "INPUT", cls: "qual", type: "text" });
			} else if(opv === 'range') {
				op.after(this._range_template());
			} else if(opv === 'fuzzy') {
				op.after(this._fuzzy_template());
			}
		},
		
		_main_template: function() {
			var sortFieldLabel = i18n.text("FilterBrowser.SortFieldLabel") || "Sort Field";
			var sortOrderLabel = i18n.text("FilterBrowser.SortOrderLabel") || "Sort Order";
			var sortNone = i18n.text("FilterBrowser.SortNone") || "Default (_score)";
			var sortDesc = i18n.text("FilterBrowser.SortDesc") || "Descending";
			var sortAsc = i18n.text("FilterBrowser.SortAsc") || "Ascending";
			var sortTitle = i18n.text("FilterBrowser.SortTitle") || "Sort";
			return { tag: "DIV", children: [
				{ tag: "DIV", cls: "uiFilterBrowser-filters" },
				{ tag: "DIV", cls: "uiFilterBrowser-sort", children: [
					{ tag: "DIV", cls: "uiFilterBrowser-sortHeader", children: [
						{ tag: "SPAN", cls: "uiFilterBrowser-sortTitle", text: sortTitle },
						{ tag: "BUTTON", type: "button", cls: "uiFilterBrowser-sortAdd", text: "+", title: "add sort", onclick: this._addSortRow_handler }
					] },
					{ tag: "DIV", cls: "uiFilterBrowser-sortRows", children: [
						this._sortRow_template(sortNone, sortDesc, sortAsc)
					] }
				] },
				{ tag: "DIV", cls: "uiFilterBrowser-toolbar", children: [
					{ tag: "BUTTON", type: "button", text: i18n.text("General.Search") || "Search", onclick: this._search_handler },
					{ tag: "LABEL", children:
						i18n.complex("FilterBrowser.OutputType", { tag: "SELECT", cls: "uiFilterBrowser-outputFormat", children: [
							{ text: i18n.text("Output.Table"), value: "table" },
							{ text: i18n.text("Output.JSON"), value: "json" },
							{ text: i18n.text("Output.CSV"), value: "csv" }
						].map(function( o ) { return $.extend({ tag: "OPTION" }, o ); } ) } )
					},
					{ tag: "LABEL", children:
						i18n.complex("FilterBrowser.OutputSize", { tag: "SELECT", cls: "uiFilterBrowser-outputSize",
							children: [ "10", "50", "250", "1000", "5000", "25000" ].map( ut.option_template )
						} )
					},
					{ tag: "LABEL", children: [ { tag: "INPUT", type: "checkbox", cls: "uiFilterBrowser-showSrc" }, i18n.text("Output.ShowSource") ] }
				] }
			]};
		},

		_sortRow_template: function(sortNone, sortDesc, sortAsc) {
			sortNone = sortNone || i18n.text("FilterBrowser.SortNone") || "Default (_score)";
			sortDesc = sortDesc || i18n.text("FilterBrowser.SortDesc") || "Descending";
			sortAsc = sortAsc || i18n.text("FilterBrowser.SortAsc") || "Ascending";
			return { tag: "DIV", cls: "uiFilterBrowser-sortRow", children: [
				{ tag: "SELECT", cls: "uiFilterBrowser-sortField", children: [
					{ tag: "OPTION", value: "_score", text: sortNone }
				] },
				{ tag: "SELECT", cls: "uiFilterBrowser-sortOrder", children: [
					{ tag: "OPTION", value: "desc", text: sortDesc },
					{ tag: "OPTION", value: "asc", text: sortAsc }
				] },
				{ tag: "BUTTON", type: "button", cls: "uiFilterBrowser-sortRemove", text: "-", title: "remove sort", onclick: this._removeSortRow_handler }
			]};
		},
		
		_filter_template: function() {
			return { tag: "DIV", cls: "uiFilterBrowser-row", children: [
				{ tag: "SELECT", cls: "bool", children: ["must", "must_not", "should"].map(ut.option_template) },
				{ tag: "SELECT", cls: "field", onchange: this._changeQueryField_handler, children: this.filters.map(function(f) {
					return { tag: "OPTION", data: { spec: f }, value: f.path.join("."), text: f.path.join(".") };
				})},
				{ tag: "BUTTON", type: "button", text: "+", onclick: this._addFilterRow_handler },
				{ tag: "BUTTON", type: "button", text: "-", onclick: this._removeFilterRow_handler }
			]};
		},
		
		_range_template: function() {
			return { tag: "SPAN", cls: "range", children: [
				{ tag: "SELECT", cls: "lowop", children: ["gt", "gte"].map(ut.option_template) },
				{ tag: "INPUT", type: "text", cls: "lowqual" },
				{ tag: "SELECT", cls: "highop", children: ["lt", "lte"].map(ut.option_template) },
				{ tag: "INPUT", type: "text", cls: "highqual" }
			]};
		},

		_fuzzy_template: function() {
			return { tag: "SPAN", cls: "fuzzy", children: [
				{ tag: "INPUT", cls: "qual", type: "text" },
				{ tag: "SELECT", cls: "fuzzyop", children: ["max_expansions", "min_similarity"].map(ut.option_template) },
				{ tag: "INPUT", cls: "fuzzyqual", type: "text" }
			]};
		}
	});
	
})( this.jQuery, this.app, this.i18n );
