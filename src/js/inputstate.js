//
// Represents a the state of the input at a specific moment.
//
InputState = function(wmd) {
	var obj = {},
		input = wmd.input;
		
	/*
	 * Public members.
	 */

	obj = extend(obj, {
		scrollTop: 0,
		text: "",
		start: 0,
		end: 0,
		
		// Gets a Chunk object from this state's text.
		getChunk:function() {
			return new Chunk(this.text, this.start, this.end, this.scrollTop);
		},

		// Restores this state onto its input.
		restore:function() {
			if (this.text !== input.value) {
				input.value = this.text;
			}

			this.setInputSelection();
			input.scrollTop = this.scrollTop;
		},

		// Sets the value of this state's text from a chunk.
		setChunk:function(chunk) {
			chunk.before = chunk.before + chunk.startTag;
			chunk.after = chunk.endTag + chunk.after;

			if (browser.Opera) {
				chunk.before = chunk.before.replace(/\n/g, "\r\n");
				chunk.selection = chunk.selection.replace(/\n/g, "\r\n");
				chunk.after = chunk.after.replace(/\n/g, "\r\n");
			}

			this.start = chunk.before.length;
			this.end = chunk.before.length + chunk.selection.length;
			this.text = chunk.before + chunk.selection + chunk.after;
			this.scrollTop = chunk.scrollTop;
		},

		// Sets this state's input's selection based on this state's start and end values.
		setInputSelection:function() {
			var range;

			if (visible(input)) {
				input.focus();

				if (input.selectionStart || input.selectionStart === 0) {
					input.selectionStart = this.start;
					input.selectionEnd = this.end;
					input.scrollTop = this.scrollTop;
				} else if (document.selection) {
					if (!document.activeElement || document.activeElement === input) {
						range = input.createTextRange();

						range.moveStart("character", -1 * input.value.length);
						range.moveEnd("character", -1 * input.value.length);
						range.moveEnd("character", this.end);
						range.moveStart("character", this.start);

						range.select();
					}
				}
			}
		},

		// Sets this state's start and end selection values from the input.
		setStartEnd:function() {
			var range,
				fixedRange,
				markedRange,
				rangeText,
				len,
				marker = "\x07";
				
			if (visible(input)) {
				if (input.selectionStart || input.selectionStart === 0) {
					this.start = input.selectionStart;
					this.end = input.selectionEnd;
				} else if (document.selection) {
					this.text = fixEol(input.value);

					// Fix IE selection issues.
					if (wmd.ieClicked && wmd.ieRange) {
						range = wmd.ieRange;
						wmd.ieClicked = false;
					} else {
						range = document.selection.createRange();
					}

					fixedRange = fixEol(range.text);
					markedRange = marker + fixedRange + marker;
					range.text = markedRange;
					rangeText = fixEol(input.value);

					range.moveStart("character", -1 * markedRange.length);
					range.text = fixedRange;

					this.start = rangeText.indexOf(marker);
					this.end = rangeText.lastIndexOf(marker) - marker.length;

					len = this.text.length - fixEol(input.value).length;

					if (len > 0) {
						range.moveStart("character", -1 * fixedRange.length);

						while(len > 0) {
							fixedRange = fixedRange + "\n";
							this.end = this.end + 1;
							len = len - 1;
						}

						range.text = fixedRange;
					}

					this.setInputSelection();
				}
			}
		}
	});
	
	/*
	 * Perform construction.
	 */
	
	if (visible(input)) {
		input.focus();
		obj.setStartEnd();
		obj.scrollTop = input.scrollTop;

		if (input.selectionStart || input.selectionStart === 0) {
			obj.text = input.value;
		}
	}
	
	return obj;
};