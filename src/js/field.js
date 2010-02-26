//
// Represents a field in a form.
//
Field = function(label, type, options) {
	label = label || "";
	type = type.toLowerCase();
	options = extend({
		required: false,
		inline: false,
		"float": false,
		items: null,
		itemsAlign: "left",
		css: "wmd-field",
		inputCss: "wmd-fieldinput",
		buttonCss: "wmd-fieldbutton",
		passwordCss: "wmd-fieldpassword",
		labelCss: "wmd-fieldlabel",
		inlineCss: "wmd-fieldinline",
		floatCss: "wmd-fieldfloat",
		errorCss: "wmd-fielderror",
		reasonCss: "wmd-fieldreason",
		hiddenCss: "wmd-hidden",
		value: "",
		group: "",
		id: "",
		insertion: null
	}, options);
	
	var element,
		labelElement,
		inner,
		inputs,
		errorElement,
		events = [],
		setFor = false;
	
	if (indexOf(Field.TYPES, type) < 0) {
		throw('"' + type + '" is not a valid field type.');
	}
	
	if (!options.id) {
		options.id = randomString(6, {upper:false});
	}
	
	element = document.createElement("div");
	element.id = options.id;
	element.className = options.css;
	
	if (options.inline) {
		addClassName(element, options.inlineCss);
	}
	
	if (options["float"]) {
		addClassname(element, options.floatCss);
	}
	
	if (type === "hidden") {
		addClassName(element, options.hiddenCss);
	}
	
	if (label) {
		labelElement = document.createElement("label");
		labelElement.className = options.labelCss;
		labelElement.innerHTML = label;
		
		if (options.required) {
			labelElement.innerHTML += ' <em>*</em>';
		}
		
		element.appendChild(labelElement);
	}
	
	inner = document.createElement("div");
	
	if (options.inline) {
		inner.className = options.inlineCss;
	}
	
	element.appendChild(inner);
	
	errorElement = document.createElement("div");
	errorElement.className = options.reasonCss;
	errorElement.style.display = "none";
	element.appendChild(errorElement);
	
	// Run the factory. We're doing a hack when setting the label's "for" attribute,
	// but we control the format in all of the create functions, so just keep it in mind.
	switch(type) {
		case("empty"):
			break;
		case("checkbox"):
		case("radio"):
			inputs = Field.createInputList(inner, type, options);
			break;
		case("select"):
			inputs = Field.createSelectList(inner, type, options);
			setFor = true;
			break;
		case("textarea"):
			inputs = Field.createTextArea(inner, type, options);
			setFor = true;
			break;
		default:
			inputs = Field.createInput(inner, type, options);
			setFor = true;
			break;
	}
	
	if (typeof inputs === "undefined") {
		inputs = null;
	}
	
	if (labelElement && setFor) {
		labelElement.setAttribute("for", Field.getInputId(options));
	}
	
	/*
	 * Public members.
	 */
	
	extend(element, {
		// Adds an event to the field's input.
		addEvent: function(event, callback) {
			var c = function() { callback(element); },
				input,
				i,
				n;
			
			if (inputs) {
				switch(type) {
					case("empty"):
						break;
					case("checkbox"):
					case("radio"):
						for(i = 0, n = inputs.length; i < n; i++) {
							addEvent(inputs[i], event, c, events);
						}
						break;
					default:
						addEvent(inputs, event, c, events);
						break;
				}
			}
			
			return this;
		},
		
		// Destroys the field.
		destroy: function() {
			while(events.length > 0) {
				removeEvent(events[0].element, events[0].action, events[0].callback, events);
			}
			
			element.parentNode.removeChild(element);
			
			return this;
		},
		
		// Sets the field error.
		error: function(show, message) {
			if (show) {
				addClassName(element, options.errorCss);
				
				if (message) {
					errorElement.innerHTML = message.toString();
					errorElement.style.display = "";
				} else {
					errorElement.innerHTML = "";
					errorElement.style.display = "none";
				}
			} else {
				removeClassName(element, options.errorCss);
				errorElement.style.display = "none";
			}
			
			return this;
		},
		
		// Focuses the field's input.
		focus: function() {
			if (this.isVisible()) {
				if (inputs) {
					if (inputs.length > 0 && (type === "checkbox" || type === "radio")) {
						inputs[0].focus();
					} else {
						inputs.focus();
					}
				}
			}
			
			return this;
		},
		
		// Hides the field.
		hide: function() {
			element.style.display = "none";
		},
		
		// Inserts HTML or DOM content into the field.
		insert: function(insertion) {
			insertion = insertion || "";
			
			var div,
				i,
				n;
			
			if (typeof insertion === "string") {
				div = document.createElement("div");
				div.innerHTML = insertion;
				
				for(i = 0, n = div.childNodes.length; i < n; i++) {
					inner.appendChild(div.childNodes[i]);
				}
			} else {
				inner.appendChild(insertion);
			}
			
			return this;
		},
		
		// Gets a value indicating whether the field is required.
		isRequired: function() {
			return !!(options.required);
		},
		
		// Gets a value indicating whether the field is visible.
		isVisible: function() {
			return !(element.style.display);
		},
		
		// Gets the field's label text.
		getLabel: function() {
			return label || "";
		},
		
		// Gets the field's type.
		getType: function() {
			return type;
		},
		
		// Gets the field's current value.
		getValue: function(primitives) {
			var value,
				i,
				n;
			
			// Helper for casting values into primitives.
			function primitive(val) {
				var bools,
					numbers,
					num;
					
				if (primitives) {
					bools = /^(true)|(false)$/i.exec(val);
					
					if (bools) {
						val = (typeof bools[2] === "undefined" || bools[2] === "") ? true : false;
					} else {
						numbers = /^\d*(\.?\d+)?$/.exec(val);
						
						if (numbers && numbers.length > 0) {
							num = (typeof numbers[1] === "undefined" || numbers[1] === "") ? parseInt(val, 10) : parseFloat(val, 10);
							
							if (!isNaN(num)) {
								val = num;
							}
						}
					}
				}
				
				return val;
			}

			if (inputs) {
				switch(type) {
					case("empty"):
						break;
					// Array of checked box values.
					case("checkbox"):
						value = [];
						for(i = 0, n = inputs.length; i < n; i++) {
							if (inputs[i].checked) {
								value.push(primitive(inputs[i].value));
							}
						}
						break;
					// Single checked box value.
					case("radio"):
						value = "";
						for(i = 0, n = inputs.length; i < n; i++) {
							if (inputs[i].checked) {
								value = primitive(inputs[i].value);
								break;
							}
						}
						break;
					case("select"):
						value = primitive(inputs.options[input.selectedIndex].value);
						break;
					default:
						value = inputs.value;
						break;
				}
			}
		
			return value;
		},
		
		// Sets the field's value.
		setValue: function(value) {
			var input,
				i,
				n,
				j,
				m,
				selectedIndex;

			// Helper for comparing the current value of input to a string.
			function li(s) { 
				return (s || "").toString() === (input ? input.value : "") 
			}
			
			if (inputs) {
				switch(type) {
					case("empty"):
						break;
					// If the value is a number we assume a flagged enum.
					case("checkbox"):
						if (typeof value === "number") {
							value = getArrayFromEnum(value);
						} else if (typeof value === "string") {
							value = [value];
						}
					
						if (value.length) {
							for(i = 0, n = inputs.length; i < n; i++) {
								input = inputs[i];
								input.checked = "";
							
								for(j = 0, m = value.length; j < m; j++) {
									if (li(value[j])) {
										input.checked = "checked";
										break;
									}
								}
							}
						}
						break;
					case("radio"):
						value = (value || "").toString();
						for(i = 0, n = inputs.length; i < n; i++) {
							inputs[i].checked = "";
						
							if (inputs[i].value === value) {
								inputs[i].checked = "checked";
							}
						}
						break;
					case("select"):
						value = (value || "").toString();
						selectedIndex = 0;
					
						for(i = 0, n = inputs.options.length; i < n; i++) {
							if (inputs.options[i].value === value) {
								selectedIndex = i;
								break;
							}
						}
					
						inputs.selectedIndex = selectedIndex;
						break;
					default:
						value = (value || "").toString();
						inputs.value = value;
						break;
				}
			}
			
			return this;
		},
		
		// Shows the field.
		show: function() {
			element.style.display = "";
		}
	});
	
	if (options.insertion) {
		element.insert(options.insertion);
	}
	
	return element;
};

// Static Field members.
extend(Field, {
	TYPES: [
		"button",
		"checkbox",
		"empty",
		"file",
		"hidden",
		"image",
		"password",
		"radio",
		"reset",
		"submit",
		"text",
		"select",
		"textarea"
	],
	
	// Creates an input field.
	createInput: function(parent, type, options) {
		var id = Field.getInputId(options),
			css = type === "button" || type === "submit" || type === "reset" ? options.buttonCss : options.inputCss,
			input = document.createElement("input");
			
		input.id = id;
		input.name = id;
		input.className = css;
		input.type = type;
		
		if (type === "password" && options.passwordCss) {
			addClassName(input, options.passwordCss);
		}
		
		input.value = (options.value || "").toString();
		parent.appendChild(input);
		
		return input;
	},
	
	// Creates an input list field.
	createInputList: function(parent, type, options) {
		var i,
			n,
			id,
			span,
			label,
			name,
			input,
			inputs = [];
			
		if (options.items && options.items.length) {
			for(i = 0, n = options.items.length; i < n; i++) {
				id = Field.getInputId(options) + "_" + i;
				
				span = document.createElement("span");
				span.className = options.inputCss;
				
				label = document.createElement("label");
				label["for"] = id;
				label.innerHTML = options.items[i].text;
				
				name = options.group ? options.group : id;
				
				input = document.createElement("input");
				input.id = id;
				input.type = type;
				input.name = name;
				
				if (options.items[i].selected) {
					input.checked = "checked";
				}
				
				if (options.items[i].value) {
					input.value = options.items[i].value.toString();
				}
				
				if (options.itemsAlign === "right") {
					span.appendChild(input);
					span.appendChild(document.createTextNode("&nbsp;"));
					span.appendChild(label);
				} else {
					span.appendChild(label);
					span.appendChild(document.createTextNode("&nbsp;"));
					span.appendChild(input);
				}
				
				parent.appendChild(span);
				inputs.push(input);
			}
		}
		
		return inputs;
	},
	
	// Creates a select field.
	createSelectList: function(parent, type, options) {
		var i,
			n,
			id = Field.getInputId(options),
			select,
			index;
		
		select = document.createElement("select");
		select.id = id;
		select.name = id;
		select.className = options.inputCss;
		parent.appendChild(select);
		
		if (options.items && options.items.length) {
			index = -1;
			
			for(i = 0, n = options.items.length; i < n; i++) {
				select.options[i] = new Option(options.items[i].text, options.items[i].value);
				
				if (options[i].selected) {
					index = i;
				}
			}
			
			if (index > -1) {
				select.selectedIndex = index;
			}
		}
		
		return select;
	},
	
	// Creates a textarea field.
	createTextArea: function(parent, type, options) {
		var id = Field.getInputId(options),
			input = document.createElement("textarea");
			
		input.id = id;
		input.name = id;
		input.className = options.inputCss;
		input.value = (options.value || "").toString();
		parent.appendChild(input);
		
		return input;
	},
	
	// Gets an array from an enumeration value, optionally taking a hash of values
	// to use. Assumes the enumeration value is a combination of power-of-two values.
	// Map keys should be possible values (e.g., "1").
	getArrayFromEnum: function(value, map) {
		var array = [],
			i = 1,
			parsed;
		
		if (typeof value === "string") {
			parsed = parseInt(value, 10);
			value = !isNaN(parse) ? parsed : 0;
		}
		
		while(i <= value) {
			if ((i & value) === i) {
				if (map) {
					array.push(map[i.toString()]);
				} else {
					array.push(i);
				}
			}
			
			i = i * 2;
		}
		
		return array;
	},
	
	// Gets an enum value from an array of enum values to combine.
	getEnumFromArray: function(array) {
		var value = 0,
			indexValue,
			i,
			n;
		
		for(i = 0, n = array.length; i < n; i++) {
			indexValue = array[i];
			
			if (typeof indexValue === "string") {
				indexValue = parseInt(indexValue, 10);
				
				if (isNaN(indexValue)) {
					indexValue = undefined;
				}
			}
			
			if (typeof indexValue === "number") {
				value = value | indexValue;
			}
		}
		
		return value;
	},
	
	// Gets the ID of the input given the field ID defined in the given options hash.
	getInputId: function(options) {
		return options.id + "_input";
	}
});