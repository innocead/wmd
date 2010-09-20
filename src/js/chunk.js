//
// Represents a chunk of text.
//
Chunk = function(text, selectionStartIndex, selectionEndIndex, selectionScrollTop) {
	var prefixes = "(?:\\s{4,}|\\s*>|\\s*-\\s+|\\s*\\d+\\.|=|\\+|-|_|\\*|#|\\s*\\[[^\n]]+\\]:)", // Markdown symbols.
		obj = {};
	
	/*
	 * Public members.
	 */

	return extend(obj, {
		before: fixEol(text.substring(0, selectionStartIndex)),
		selection: fixEol(text.substring(selectionStartIndex, selectionEndIndex)),
		after: fixEol(text.substring(selectionEndIndex)),
		scrollTop: selectionScrollTop,
		startTag: "",
		endTag: "",
		
		// Adds blank lines to this chunk.
		addBlankLines: function(numberBefore, numberAfter, findExtra) {
			var regexText,
				replacementText,
				match;
				
			numberBefore = (typeof numberBefore === "undefined" || numberBefore === null) ? 1 : numberBefore;
			numberAfter = (typeof numberAfter === "undefined" || numberAfter === null) ? 1 : numberAfter;

			numberBefore = numberBefore + 1;
			numberAfter = numberAfter + 1;

			// New bug discovered in Chrome, which appears to be related to use of RegExp.$1
			// Hack it to hold the match results. Sucks because we're double matching...
			match = /(^\n*)/.exec(this.selection);
			this.selection = this.selection.replace(/(^\n*)/, "");
			this.startTag = this.startTag + (match ? match[1] : "");
			match = /(\n*$)/.exec(this.selection);
			this.selection = this.selection.replace(/(\n*$)/, "");
			this.endTag = this.endTag + (match ? match[1] : "");
			match = /(^\n*)/.exec(this.startTag);
			this.startTag = this.startTag.replace(/(^\n*)/, "");
			this.before = this.before + (match ? match[1] : "");
			match = /(\n*$)/.exec(this.endTag);
			this.endTag = this.endTag.replace(/(\n*$)/, "");
			this.after = this.after + (match ? match[1] : "");

			if (this.before) {
				regexText = replacementText = "";

				while (numberBefore > 0) {
					regexText = regexText + "\\n?";
					replacementText = replacementText + "\n";
					numberBefore = numberBefore - 1;
				}

				if (findExtra) {
					regexText = "\\n*";
				}

				this.before = this.before.replace(new RegExp(regexText + "$", ""), replacementText);
			}

			if (this.after) {
				regexText = replacementText = "";

				while (numberAfter > 0) {
					regexText = regexText + "\\n?";
					replacementText = replacementText + "\n";
					numberAfter = numberAfter - 1;
				}

				if (findExtra) {
					regexText = "\\n*";
				}

				this.after = this.after.replace(new RegExp(regexText, ""), replacementText);
			}
			
			return this;
		},
		
		// Sets this chunk's start and end tags using the given expressions.
		setTags: function(startExp, endExp) {
			var that = this,
				tempExp;

			if (startExp) {
				tempExp = extendRegExp(startExp, "", "$");

				this.before = this.before.replace(tempExp, function(match) {
					that.startTag = that.startTag + match;
					return "";
				});

				tempExp = extendRegExp(startExp, "^", "");

				this.selection = this.selection.replace(tempExp, function(match) {
					that.startTag = that.startTag + match;
					return "";
				});
			}

			if (endExp) {
				tempExp = extendRegExp(endExp, "", "$");

				this.selection = this.selection.replace(tempExp, function(match) {
					that.endTag = match + that.endTag;
					return "";
				});
				
				tempExp = extendRegExp(endExp, "^", "");

				this.after = this.after.replace(tempExp, function(match) {
					that.endTag = match + that.endTag;
					return "";
				});
			}

			return this;
		},
		
		// Trims whitespace from this chunk.
		trimWhitespace: function(remove) {
			this.selection = this.selection.replace(/^(\s*)/, "");

			if (!remove) {
				this.before = this.before + RegExp.$1;
			}

			this.selection = this.selection.replace(/(\s*)$/, "");

			if (!remove) {
				this.after = RegExp.$1 + this.after;
			}
			
			return this;
		},
		
		// Removes wrapping Markdown symbols from this chunk's selection.
		unwrap: function() {
			var text = new RegExp("([^\\n])\\n(?!(\\n|" + prefixes + "))", "g");
			this.selection = this.selection.replace(text, "$1 $2");
			return this;
		},
		
		// Wraps this chunk's selection in Markdown symbols.
		wrap: function(len) {
			var regex = new RegExp("(.{1," + len + "})( +|$\\n?)", "gm");
			this.unwrap();
			this.selection = this.selection.replace(regex, function(line, marked) {
				if (new RegExp("^" + prefixes, "").test(line)) {
					return line;
				}
				
				return marked + "\n";
			});
			
			this.selection = this.selection.replace(/\s+$/, "");
			
			return this;
		}
	});
};