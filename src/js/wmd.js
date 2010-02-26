// "Global" variable declarations.
var WMD,
	Chunk,
	InputState,
	Command,
	Dialog,
	Overlay,
	Form,
	Field,
	LinkHelper,
	documentElement,
	eventCache = [],
	browser = {
		IE: !!(window.attachEvent && !window.opera),
		Opera: !!window.opera,
		WebKit: navigator.userAgent.indexOf('AppleWebKit/') > -1
	};
	
//
// Constructor. Creates a new WMD instance.
//
WMD = function(input, toolbar, options) {
	options = extend({
		preview: null,
		previewEvery: .5,
		showdown: null,
		lineLength: 40,
		commands: "strong em spacer a blockquote code img spacer ol ul h hr",
		commandTable: {}
	}, options);
	
	if (typeof input === "string") {
		input = document.getElementById(input);
	}
	
	if (typeof toolbar === "string") {
		toolbar = document.getElementById(toolbar);
	}
	
	var obj = {},
		shortcuts = {},
		previewInterval,
		lastValue = "";
		
	// Try and default showdown if necessary.
	if (!options.showdown && typeof Attacklab !== "undefined" && Attacklab.showdown && Attacklab.showdown.converter) {
		options.showdown = new Attacklab.showdown.converter().makeHtml;
	}
	
	/*
	 * Private members.
	 */
	
	// Builds the toolbar.
	function buildToolbar() {
		var ul,
			i,
			key,
			definition,
			builder,
			command,
			commands = options.commands.split(" ");

		if (toolbar) {
			toolbar.innerHTML = "";
			ul = document.createElement("ul");
			ul.className = "wmd-toolbar";
			toolbar.appendChild(ul);
		
			for(i = 0; i < commands.length; i = i + 1) {
				key = commands[i];
				definition = null;
				command = null;
				builder = Command.create;
			
				if (options.commandTable[key]) {
					definition = options.commandTable[key];
				} else if (Command.builtIn[key]) {
					definition = Command.builtIn[key];
				}
			
				if (definition) {
					if (definition.builder && typeof definition.builder === "function") {
						builder = definition.builder;
					}

					command = builder(obj, key, definition);
					
					if (definition.shortcut && typeof definition.shortcut === "string") {
						shortcuts[definition.shortcut.toLowerCase()] = command.run;
					}
					
					command.draw(ul);
				}
			}
		}
	}
	
	// Creates the global events.
	function createEvents() {
		var onSubmit;
		
		// Command shortcuts.
		addEvent(input, browser.Opera ? "keypress" : "keydown", function(event) {
			var ev = event || window.event,
				keyCode = ev.keyCode || ev.which,
				keyChar = String.fromCharCode(keyCode).toLowerCase();

			if (ev.ctrlKey || ev.metaKey) {
				if (shortcuts[keyChar] && typeof shortcuts[keyChar] === "function") {
					shortcuts[keyChar]();
					
					if (ev.preventDefault) {
						ev.preventDefault();
					}
					
					if (window.event) {
						window.event.returnValue = false;
					}

					return false;
				}
			}
		});
		
		// Auto-continue lists, code blocks and block quotes when "Enter" is pressed.
		addEvent(input, "keyup", function(event) {
			var ev = event || window.event,
				keyCode = ev.keyCode || ev.which,
				state,
				chunk;
				
			if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey && keyCode === 13) {
				state = new InputState(obj);
				chunk = state.getChunk();
				
				Command.autoIndent(obj, chunk, function() {
					state.setChunk(chunk);
					state.restore();
				});
			}
		});
		
		// Prevent ESC from clearing the input in IE.
		if (browser.IE) {
			addEvent(input, "keypress", function(event) {
				var ev = event || window.event,
					keyCode = ev.keyCode || ev.which;
				
				if (keyCode === 27) {
					ev.returnValue = false;
					return false;
				}
			});
		}
		
		// Preview?
		if (options.preview && options.previewEvery > 0 && typeof options.showdown === "function") {
			if (typeof options.preview === "string") {
				options.preview = document.getElementById(options.preview);
			}
			
			function refreshPreview() {
				if (input.value !== lastValue) {
					options.preview.innerHTML = options.showdown(input.value);
					lastValue = input.value;
				}
			}

			previewInterval = setInterval(refreshPreview, options.previewEvery * 1000);
			addEvent(input, "keypress", refreshPreview);
			addEvent(input, "keydown", refreshPreview);
		}
	}
	
	// Run the setup.
	buildToolbar();
	createEvents();
	
	/*
	 * Public members.
	 */
	
	return extend(obj, {
		input: input,
		options: options,
		ieClicked: false,
		ieRange: null
	});
};

/*
 * Utility functions.
 */

// Adds a CSS class name to an element if it isn't already defined on the element.
function addClassName(element, className) {
	var elementClassName = element.className;
	
	if (!(elementClassName.length > 0 && (elementClassName === className || new RegExp("(^|\\s)" + className + "(\\s|$)").test(elementClassName)))) {
		element.className = element.className + (element.className ? " " : "") + className;
	}
	
	return element;
}

// Adds an event listener to a DOM element.
function addEvent(element, event, callback, cache) {
	if (element.attachEvent) { // IE.
		element.attachEvent("on" + event, callback);
	} else { // Everyone else.
		element.addEventListener(event, callback, false);
	}
	
	if (cache && typeof cache.push === "function") {
		cache.push({element:element, event:event, callback:callback});
	} else {
		eventCache.push({element:element, event:event, callback:callback});
	}
}

// Extends a destination object by the source object.
function extend(dest, source) {
	source = source || {};
	dest = dest || {};
	
	var prop;
	
	for(prop in source) {
		if (source.hasOwnProperty(prop) && typeof source[prop] !== "undefined") {
			dest[prop] = source[prop];
		}
	}
	
	return dest;
}

// Extends a regular expression by prepending and/or appending to
// its pattern.
function extendRegExp(regex, pre, post) {
	var pattern = regex.toString(),
		flags = "",
		result;
		
	if (pre === null || pre === undefined)
	{
		pre = "";
	}
	
	if(post === null || post === undefined)
	{
		post = "";
	}

	// Replace the flags with empty space and store them.
	// Technically, this can match incorrect flags like "gmm".
	result = pattern.match(/\/([gim]*)$/);
	
	if (result === null) {
		flags = result[0];
	} else {
		flags = "";
	}
	
	// Remove the flags and slash delimiters from the regular expression.
	pattern = pattern.replace(/(^\/|\/[gim]*$)/g, "");
	pattern = pre + pattern + post;
	
	return new RegExp(pattern, flags);
}

// Normalizes line endings into just "\n".
function fixEol(text) {
	return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Gets the dimensions of the current viewport.
function getViewportDimensions() {
	if (!documentElement) {
		if (browser.WebKit && !document.evaluate) {
			documentElement = document;
		} else if (browser.Opera && window.parseFloat(window.opera.version()) < 9.5) {
			documentElement = document.body;
		} else {
			documentElement = document.documentElement;
		}
	}
	
	return {width:documentElement.clientWidth, height:documentElement.clientHeight};
}

// Gets the index of the given element in the given array.
function indexOf(array, item) {
	var i, n;
	
	if (array) {
		if (typeof array.indexOf !== "undefined") {
			return array.indexOf(item);
		}
		
		if (typeof array.length !== "undefined") {
			for(i = 0, n = array.length; i < n; i++) {
				if (array[i] === item) {
					return i;
				}
			}
		}
	}
	
	return -1;
}

// Generates a random string.
function randomString(length, options) {
	options = extend({
		numbers: false,
		lower: true,
		upper: true,
		other: false
	}, options);

	var numbers = "0123456789";
	var lower = "abcdefjhijklmnopqrstuvwxyz";
	var upper = "ABCDEFJHIJKLMNOPQRSTUVWXYZ";
	var other = "`~!@#$%^&*()-_=+[{]}\\|;:'\",<.>/?";
	var charset = "", str = "";
	
	if (options.numbers) { 
	    charset += numbers;
	}
	
	if (options.lower) {
	    charset += lower;
	}
	
	if (options.upper) {
	    charset += upper;
	}
	
	if (options.other) { 
	    charset += other;
       }
       
	if (charset.length === 0) {
		throw("There is no character set from which to generate random strings.");
	}

	function getCharacter() {
		return charset.charAt(getIndex(0, charset.length));
	}

	function getIndex(lower, upper) {
		return Math.floor(Math.random() * (upper - lower)) + lower;
	}

	for(var i = 0; i < length; i++) {
		str += getCharacter();
	}

	return str;
}

// Removes a CSS class name from an element.
function removeClassName(element, className) {
	element.className = element.className
		.replace(new RegExp("(^|\\s+)" + className + "(\\s+|$)"), " ")
		.replace(/^\s+/, "")
		.replace(/\s+$/, "");
		
	return element;
}

// Removes an event listener from a DOM element.
function removeEvent(element, event, callback, cache) {
	var cached = null, 
		i = 0;
		
	cache = (cache && typeof cache.push === "function") ? cache : eventCache;
	
	for(; i < cache.length; i++) {
		if (cache[i].element === element &&
			cache[i].event === event &&
			cache[i].callback === callback) {
			cached = cache[i];
			break;
		}
	}
	
	if (element.detachEvent) { // IE.
		element.detachEvent("on" + event, callback);
	} else { // Everyone else.
		element.removeEventListener(event, callback, false); 
	}
	
	if (cached) {
		cache.splice(indexOf(cache, cached), 1);
	}
}

// Gets a value indicating whether an element is visible.
function visible(element) {
	var v = true;
	
	if (window.getComputedStyle) {
		v = window.getComputedStyle(element, null).getPropertyValue("display") !== "none";
	} else if (element.currentStyle) {
		v = element.currentStyle["display"] !== "none";
	}
	
	return v;
}

// Kill all cached events on window unload.
addEvent(window, "unload", function() {
	while(eventCache.length > 0) {
		removeEvent(eventCache[0].element, eventCache[0].event, eventCache[0].callback);
	}
});