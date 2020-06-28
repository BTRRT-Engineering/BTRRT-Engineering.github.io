var ppFactory = (function() {
	var PPFactory = function() {
		this.scripts = [];
		this.includes = {};
		this.objParentNode = null; // parent node of the object we'll create - will be replaced by the object
	}
	
	// JS APIs are called by first loading any needed scripts and CSS files
	// before running the creation function. Everything is loaded asynchronously
	// and ordering is handled by chaining the onload events in the order the methods are called
	PPFactory.prototype.createChart = function(config, node) {
		this.loadScript("/report2/highcharts/5.0.6/highcharts.js").
			 loadScript("/report2/highcharts/5.0.6/highcharts-more.js").
			 loadScript("/report2/highcharts/5.0.6/modules/heatmap.js").
			 run(config, node, 'highcharts');
	}
	
	PPFactory.prototype.createMap = function(config, node) {
		if (config.chart && config.chart.map) {
			var mapName = config.chart.map;
			var mapUrl = "https://code.highcharts.com/mapdata/" + mapName + ".js";
			
			this.loadScript("/report2/proj4js/proj4.js").
				 loadScript("/report2/highcharts/5.0.6/highcharts.js").
				 loadScript("/report2/highcharts/5.0.6/highcharts-more.js").
				 loadScript("/report2/highcharts/5.0.6/modules/map.js").
				 loadScript(mapUrl).
				 run(config, node, 'highmap');
		}
	}
	
	PPFactory.prototype.createGrid = function(config, node) {
		this.loadStyleSheet("/sci-ag-grid/styles/ag-grid.css")
			.loadScript(	"/sci-ag-grid/ag-grid.min.js")
			.run(config, node, 'ag-grid');
	}
	
	PPFactory.prototype.createGoogleChart = function(config, node) {
		this.loadScript("https://www.gstatic.com/charts/loader.js")
			.loadScript("https://www.google.com/jsapi")
			.run(config, node, 'Google Charts');
	}
	
	PPFactory.prototype.run = function(config, node, type) {
		// the node argument to this function is the best guess at what the parent node of the config is.
		// normally it's the parent node of the last item in the document.scripts array.
		// This is correct for a normal page load: the scripts are evaluated in order as they are parsed.
		// But for chunks of HTML returned via Ajax, these are NOT evaluated automatically
		// and if the returned HTML contains multiple script tags, we can't rely on the last element of the array
		// being the script tag we're currently eval'ing. 
		// We therefore set the objParentNode field before eval'ing the script in Ajax calls, and replace the node
		// argument before continuing.
		if (this.objParentNode !== null) {
			node = this.objParentNode;
		}
	
		var self = this;
		var runFn = function() {
			if (type === 'highcharts') {
				$(function () {
					$(node).highcharts(config);
				});
			}
			if (type === 'highmap') {
				$(function () {
					$(node).highcharts('Map', config);
				});
			}
			else if (type === 'ag-grid') {
				$(node).empty();
				var grid = new agGrid.Grid(node, config);
			}
			else if (type === 'Google Charts') {
				// load function can only be called once, but we can't put it in a separate file
				// (it uses document.write, which is intended to be used before the document  
				// has been parsed and closed, which can't be guaranteed when loaded from an async script tag)
				// So we use the JS object type identifier itself to see if its been run yet, rather
				// than a source URL
				if (!self.includes[type]) {
					google.charts.load('current', {'packages':['geochart']});
					self.includes[type] = true;
				}
				
				var callback = function() {
					(new google.visualization.GeoChart(node)).draw(
						google.visualization.arrayToDataTable(
							config.data
						),
						config.config);
				}
				
				google.charts.setOnLoadCallback(callback);
				window.addEventListener('resize', callback);
			}
			self.scripts = [];
		};
		if (this.scripts.length > 0) {
			// If there are dependencies that need loading before this function can run
			// we must defer invocation of the function
			this.scheduleFn(runFn);
			document.getElementsByTagName('head')[0].appendChild(this.scripts[0]);
		}
		else {
			runFn();
		}
	}
	
	PPFactory.prototype.load = function(srcPath, type) {		
		if (!this.includes[srcPath]) {
			this.includes[srcPath] = true;
			if (type === "script") {
				var script = this.createScript(srcPath);
			}
			else {
				var script = this.createStyleSheet(srcPath);
			}

			// maintain load ordering by deferring invocation of this load
			// until all the previously specified scripts have finished
			if (this.scripts.length > 0) {
				var onLoadFn = this.createLoadFn(script);
				this.scheduleFn(onLoadFn);
			}
			
			this.scripts.push(script);
		}
		return this;
	}
	
	PPFactory.prototype.loadScript = function(srcPath) {
		return this.load(srcPath, 'script');
	}
	PPFactory.prototype.loadStyleSheet = function(srcPath) {
		return this.load(srcPath, 'stylesheet');
	}
	
	PPFactory.prototype.createStyleSheet = function(srcPath) {
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = srcPath;
		return link;
	}
	
	PPFactory.prototype.createScript = function(srcPath) {
		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = srcPath;
		return script;
	}
	
	PPFactory.prototype.createLoadFn = function(script) {
		return function() {
			document.getElementsByTagName('head')[0].appendChild(script);
		}
	}
	
	PPFactory.prototype.evalScripts = function(container) {
		var self = this;
		$(container).find("script").each(function(i, e) {
			// set the parent node so that we know where to put the created object
			self.setObjParentNode(e.parentNode);
			eval(e.innerHTML);
			// set it back to null when we're done to be on the safe side
			self.setObjParentNode(null);
		});
	}
	
	PPFactory.prototype.addOnload = function(script, fn) {
		// Check if the onload isn't already set
		// (can happen if the first call to create an object of this type hasn't finished loading dependencies
		// when a second call to create object of this type is run)
		if (script.onload) {
			// If it is already set, create a new onload consisting of the old one and our new function.
			var oldOnLoad = script.onload;
			script.onload = function() { oldOnLoad(); fn(); }
		}
		else {
			script.onload = fn;
		}
	}
	
	PPFactory.prototype.scheduleFn = function(fn) {
		// Assumes that the scripts array is non-empty
		// Adds this function to the onload event of the last script
		// in the array
		var lastScript = this.scripts[this.scripts.length - 1];
		this.addOnload(lastScript, fn);
	}
	
	// Scripts that create objects are always child nodes of the node that will contain
	// the created object. This method should be called by functions which are responsible
	// for invoking scripts returned by an Ajax call - it's surprisingly hard for the code in
	// a script to work out what its parent element is. 
	PPFactory.prototype.setObjParentNode = function(node) {
		if (node !== null) {
			this.objParentNode = node;
		}
		else {
			this.objParentNode = null;
		}
	}
	
	PPFactory.prototype.addEventListener = function(fn) {
		if (this.objParentNode !== null) {
			fn();
		}
		else {
			window.addEventListener('load', fn);
		}
	}
	
	PPFactory.prototype.runProtocol = function(protocol, params, resultId) {
		var launchJobData = $.extend(
			params,
			{
				$protocol: protocol,
				$blocking: false,
				$keepJob: false
			}
		);
		
		var handleAjaxError = function handleAjaxError(jqXHR, textStatus, errorThrown, msg) {
			$("body").css("cursor", "default");
			var detail = "";
			if (jqXHR.readyState == 4) {
				detail = jqXHR.statusText;
			}
			else if (jqXHR.readyState == 0) {
				detail = "network error (server is down or refusing connection due to authentication or CORS problem)";
			}
			else {
				detail = "an unknown error occurred, please retry the request";
			}
			alert(msg + ": " + detail + ".");
		};
		
		var server = document.location.origin;
		// change cursor
		$("body").css("cursor", "progress");
		
		$.ajax(
			server + "/auth/launchjob", 
			{
				headers: {
					Accept: "application/json"
				},
				data: launchJobData,
				error: function(jqXHR, textStatus, errorThrown) {
					handleAjaxError(jqXHR, textStatus, errorThrown, "Error launching job");
				},
				success: function(response, textStatus, jqXHR) { 
					var jobId = response.data.value;
					var status = "initializing";
					(function poll() {
						if (status !== "complete") {
							$.ajax(
								server + "/jobs/" + jobId + "/status",
								{
									headers: {
										Accept: "application/json"
									},
									success: function(response, textStatus, jqXHR) {
										status = response.data.value;
									},
									error: function(jqXHR, textStatus, errorThrown) {
										handleAjaxError(jqXHR, textStatus, errorThrown, "Error fetching job status");
									},
									complete: function() {
										if (status === "running" || status === "initializing") {
											setTimeout(function() { poll() }, 500);
										}
										else if (status === "complete") {
											$.ajax(
												server +  "/jobs/" + jobId + "/results/all",
												{
													data: {
														$streamFile: "/\.html$/",
													},
													success: function(response, textStatus, jqXHR) {
														var container = document.getElementById(resultId);
														// change cursor back
														$("body").css("cursor", "default");
														if (container !== null) {
															container.innerHTML = response;
															ppFactory.evalScripts(container);
														}
														else {
															alert("Couldn't find results container '" + resultId + "' to insert results into.")
														}
													},
													error: function(jqXHR, textStatus, errorThrown) {
														handleAjaxError(jqXHR, textStatus, errorThrown, "Error fetching protocol result");
													}
											});
										}
										else {
											$("body").css("cursor", "default");
											alert("Error running protocol: status is '" + status + "'");
										}
									}
								}
							);
						}
					})();
				}
			}
		);
	}
	
	return new PPFactory();
})();
