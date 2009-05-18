//
// Creates dynamic forms.
//
Form = function(title, options) {
	title = title || "";
	options = extend({
		css: "wmd-form",
		legendCss: "wmd-legend",
		errorCss: "wmd-error",
		requiredReason: "Required",
		dialogCss: "wmd-dialog",
		dialog: false,
		modal: true,
		dialogZIndex: 10,
		closeOnEsc: true,
		id: "",
		onSubmit: null,
		onDestroy: null
	}, options);
	
	var element,
		events = [],
		fields = [],
		fieldset,
		error,
		dialog;
		
	if (!options.id) {
		options.id = randomString(6, {upper:false});
	}
	
	element = document.createElement("form");
	element.id = options.id;
	element.className = options.css;
	element.onsubmit = function() { 
		if (typeof options.onSubmit === "function") {
			options.onSubmit(element);
		}
		
		return false;
	};
	
	fieldset = document.createElement("fieldset");
	element.appendChild(fieldset);
	
	legend = document.createElement("div");
	legend.className = options.legendCss;
	legend.style.display = "none";
	fieldset.appendChild(legend);
	
	error = document.createElement("div");
	error.className = options.errorCss;
	error.style.display = "none";
	fieldset.appendChild(error);
	
	if (options.dialog) {
		dialog = new Dialog({
			modal: options.modal,
			zIndex: options.dialogZIndex,
			css: options.dialogCss,
			closeOnEsc: false,
			insertion: element
		});
	}
	
	addEvent(document, "keypress", function(event) {
		var e = event || window.event,
			keyCode = e.keyCode || e.which;

		switch(keyCode) {
			case(27):
				if (options.closeOnEsc) {
					element.destroy();
				}
				break;
			default:
				break;
		}
	}, events);
	
	/*
	 * Private functions.
	 */
	
	// Finds a field by key. Returns {field, index}.
	function findField(key) {
		var field = null,
			index = -1,
			i,
			n;
		
		for(i = 0, n = fields.length; i < n; i++) {
			if (fields[i].key === key) {
				field = fields[i].value;
				index = i;
				break;
			}
		}
		
		return {field:field, index:index};
	}
	
	// Removes a field from the field cache.
	function removeField(key) {
		var newFields = [],
			i,
			n;
			
		for(i = 0, n = fields.length; i < n; i++) {
			if (fields[i].key !== key) {
				newFields.push(fields[i]);
			}
		}
		
		fields = newFields;
	}
	
	/*
	 * Public members.
	 */
	
	extend(element, {
		// Adds a field to the end of the form.
		addField: function(key, field) {
			return this.insertField(-1, key, field);
		},
		
		// Destroys the form.
		destroy: function() {
			var i,
				n;
				
			if (typeof options.onDestroy === "function") {
				options.onDestroy(this);
			}
			
			while(events.length > 0) {
				removeEvent(events[0].element, events[0].event, events[0].callback, events);
			}
			
			for(i = 0, n = fields.length; i < n; i++) {
				if (fields[i].value) {
					if (typeof fields[i].value.destroy === "function") {
						fields[i].value.destroy();
					} else if (fields[i].value.parentNode) {
						fields[i].value.parentNode.removeChild(fields[i].value);
					}
					
					fields[i].value = null;
				}
			}
			
			fields = [];
			
			element.parentNode.removeChild(element);
			element = null;
			
			if (dialog) {
				dialog.destroy();
				dialog = null;
			}
			
			return this;
		},
		
		// Writes an error to the form's error container.
		error: function (message) {
			message = (message || "").toString();
			error.innerHTML = message;
			error.style.display = message ? "" : "none";
			
			// Redraw the dialog because Firefox is dumb with rounded corners.
			if (dialog) {
				dialog.redraw();
			}
			
			return this;
		},
		
		// Fills the form with the given object hash.
		fill: function(obj) {
			var prop;
			
			if (obj) {
				for(prop in obj) {
					if (obj.hasOwnProperty(prop)) {
						this.setValue(prop, obj[prop]);
					}
				}
			}
			
			return this;
		},
		
		// Focuses the first focus-able field in the form.
		focus: function() {
			var i,
				n;
				
			for(i = 0, n = fields.length; i < n; i++) {
				if (fields[i].value && typeof fields[i].value.focus === "function") {
					fields[i].value.focus();
					break;
				}
			}
			
			return this;
		},
		
		// Gets the form's dialog instance.
		getDialog: function() {
			return dialog;
		},
		
		// Gets the field with the specified key.
		getField: function(key) {
			var field = findField(key);
			return field ? field.value : null;
		},
		
		// Gets the value of the field with the specified key.
		getValue: function(key, primitives) {
			var field = findField(key);
			
			if (field && field.value && typeof field.value.getValue === "function") {
				return field.value.getValue(primitives);
			} else {
				return undefined;
			}
		},
		
		// Inserts a fields at the specified index.
		insertField: function(index, key, field) {
			this.removeField(key);
			
			if (index >= 0 && fields.length > index) {
				fields.splice(index, 0, {key:key, value:field});
				fields[index + 1].value.parentNode.insertBefore(field, fields[index + 1].value);
			} else {
				fields.push({key:key, value:field});
				fieldset.appendChild(field);
			}
			
			// Redraw the dialog because Firefox is dumb with rounded corners.
			if (dialog) {
				dialog.redraw();
			}
			
			return this;
		},
		
		// Removes a field from the fieldset by key.
		removeField: function(key) {
			var field = findField(key);
			
			if (field.value) {
				if (typeof field.value.destroy === "function") {
					field.value.destroy();
				} else if (field.value.parentNode) {
					field.value.parentNode.removeChild(field.value);
				}
				
				removeField(key);
			}
			
			// Redraw the dialog because Firefox is dumb with rounded corners.
			if (dialog) {
				dialog.redraw();
			}
			
			return this;
		},
		
		// Serializes the form into an object hash, optionally
		// stopping and highlighting required fields.
		serialize: function(ensureRequired, primitives) {
			var hash = {},
				missing = 0,
				field,
				value,
				type,
				i,
				n;

			for(i = 0, n = fields.length; i < n; i++) {
				field = fields[i].value;
				value = field.getValue(primitives);
				type = field.getType();
				
				if (type !== "empty" && type !== "submit" && type !== "reset" && type !== "button") {
					if (value !== "" && typeof value !== "undefined" && value !== null && value.length !== 0) {
						hash[fields[i].key] = value;
						field.error();
					} else if (ensureRequired && field.isRequired() && field.isVisible()) {
						missing = missing + 1;
						field.error(true, options.requiredReason);
					}
				}
			}
			
			// Redraw the dialog because Firefox is dumb with rounded corners.
			if (dialog) {
				dialog.redraw();
			}
			
			return missing === 0 ? hash : null;
		},
		
		// Sets the legend title.
		setTitle: function(title) {
			legend.innerHTML = title || "";
			legend.style.display = title ? "" : "none";
			
			return this;
		},
		
		// Sets a field's value.
		setValue: function(key, value) {
			var field = findField(key);
			
			if (field && field.value && typeof field.value.setValue === "function") {
				field.value.setValue(value);
			}
			
			return this;
		}
	});
	
	element.setTitle(title);
	return element;
};