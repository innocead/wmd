//
// Creates a dialog (i.e., a container) with an optional screen overlay.
//
Dialog = function(options) {
	var obj,
		element,
		overlay,
		events = [],
		options = extend({
			zIndex: 10,
			css: "wmd-dialog",
			overlayColor: "#FFFFFF",
			modal: true,
			closeOnEsc: true,
			insertion: null,
			onDestroy: null
		}, options);
	
	/*
	 * Private members.
	 */
	
	// Builds the dialog's DOM.
	function build() {
		if (!element) {

			if (options.modal) {
				overlay = new Overlay({
					color: options.overlayColor,
					zIndex: options.zIndex - 1
				});
			}
			
			element = document.createElement("div");
			document.body.appendChild(element);
			
			element.className = options.css;
			element.style.position = "absolute";
			element.style.zIndex = options.zIndex;
			element.style.top = (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop) + "px";
			
			if (options.insertion) {
				obj.fill(options.insertion);
			}
			
			if (options.closeOnEsc) {
				addEvent(document, "keypress", function(event) {
					var ev = event || window.event,
						keyCode = ev.keyCode || ev.which;
						
					if (keyCode === 27) {
						obj.destroy();
					}
				}, events);
			}
		}
	}
	
	/*
	 * Public members.
	 */
	
	obj = extend(obj, {
		// Destroys the dialog.
		destroy: function() {
			while(events.length > 0) {
				removeEvent(events[0].element, events[0].event, events[0].callback, events);
			}
			
			if (overlay) {
				overlay.destroy();
				overlay = null;
			}
			
			if (element) {
				element.parentNode.removeChild(element);
				element = null;
			}
			
			if (typeof options.onDestroy === "function") {
				options.onDestroy(this);
			}
		},
		
		// Fills the dialog with an insertion, clearing it first.
		fill: function(insertion) {
			if (element) {
				element.innerHTML = "";
				insertion = insertion || "";
				
				if (typeof insertion === "string") {
					element.innerHTML = insertion;
				} else {
					element.appendChild(insertion);
				}
			}
		},
		
		// Hides the dialog.
		hide: function() {
			if (element) {
				element.style.display = "none";
			}
		},
		
		// Forces the browser to redraw the dialog.
		// Hack to work around inconsistent rendering in Firefox
		// when the dialog's element has browser-implemented rounded 
		// corners and its contents expand/contract the element's size.
		redraw: function() {
			var css;

			if (element) {
				css = element.className;
				element.className = "";
				element.className = css;
			}
		},
		
		// Shows the dialog.
		show: function() {
			if (element) {
				element.style.display = "";
			}
		}
	});
	
	build();
	return obj;
};

//
// Creates a simple screen overlay.
//
Overlay = function(options) {
	var obj = {},
		events = [],
		element,
		iframe,
		options = extend({
			color: "#FFFFFF",
			zIndex: 9,
			scroll: true,
			opacity: 0.3
		}, options); 
		
	/*
	 * Private members.
	 */
	
	// Updates the DOM element's size a position to fill the screen.
	function update() {
		var scroll,
			size;
			
		if (element) {
			scroll = {
				left: window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft,
				top: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop
			};

			size = getViewportDimensions();

			element.style.width = size.width + "px";
			element.style.height = size.height + "px";
			element.style.left = scroll.left + "px";
			element.style.top = scroll.top + "px";

			if (iframe) {
				iframe.style.width = size.width + "px";
				iframe.style.height = size.height + "px";
				iframe.style.left = scroll.left + "px";
				iframe.style.top = scroll.top + "px";
			}
		}
	}
	
	// Builds the overlay's DOM.
	function build() {
		if (!element) {
			element = document.createElement("div");
			document.body.appendChild(element);

			element.style.position = "absolute";
			element.style.background = options.color;
			element.style.zIndex = options.zIndex;
			element.style.opacity = options.opacity;

			// Check for IE, in which case we need to add an iframe mask.
			if (browser.IE) {
				element.style.filter = "progid:DXImageTransform.Microsoft.Alpha(opacity=" + (options.opacity * 100) + ")";
				
				iframe = document.createElement("iframe");
				document.body.appendChild(iframe);

				iframe.frameBorder = "0";
				iframe.scrolling = "no";
				iframe.style.position = "absolute";
				iframe.style.filter = "progid:DXImageTransform.Microsoft.Alpha(opacity=0)";
				iframe.style.zIndex = options.zIndex - 1;
			}

			if (options.scroll) {
				addEvent(window, "resize", update, events);
				addEvent(window, "load", update, events);
				addEvent(window, "scroll", update, events);
			}

			update();
		}
	}
	
	/*
	 * Public members.
	 */

	obj = extend(obj, {
		// Destroys the overlay.
		destroy: function() {
			while(events.length > 0) {
				removeEvent(events[0].element, events[0].event, events[0].callback, events);
			}
			
			if (element) {
				element.parentNode.removeChild(element);
				element = null;
			}
			
			if (iframe) {
				iframe.parentNode.removeChild(iframe);
				iframe = null;
			}
		}
	});
	
	build();
	return obj;
};