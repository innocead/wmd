//
// Provides common command functions.
//
Command = function(wmd, definition, runner, options) {
	options = extend({
		downCssSuffix: "-down"
	}, options);
	
	var element,
		obj = {},
		downCss = definition.css + options.downCssSuffix;
		
	/*
	 * Private members.
	 */
	
	// Resets this command element's CSS to its original state.
	function resetCss() {
		if (element) {
			element.className = Command.css.base + " " + definition.css;
		}
	}
	
	/*
	 * Public members.
	 */

	return extend(obj, {
		// Draws the command DOM and adds it to the given parent element.
		draw:function(parent) {
			var span,
				downCss = definition.css + options.downCssSuffix;

			if (!element) {
				element = document.createElement("li");
				element.title = definition.title;
				parent.appendChild(element);

				span = document.createElement("span");
				span.innerHTML = definition.text;
				element.appendChild(span);

				addEvent(element, "click", function(event) {
					resetCss();
					obj.run();
				});
				
				addEvent(element, "mouseover", function(event) {
					resetCss();
					addClassName(element, Command.css.over);
				});
				
				addEvent(element, "mouseout", function(event) {
					resetCss();
				});
				
				addEvent(element, "mousedown", function(event) {
					resetCss();
					addClassName(element, Command.css.down);
					addClassName(element, downCss);
					
					if (browser.IE) {
						wmd.ieClicked = true;
						wmd.ieRange = document.selection.createRange();
					}
				});
			} else {
				parent.appendChild(element);
			}
			
			resetCss();
		},
		
		// Runs the command.
		run:function() {
			var state = new InputState(wmd),
				chunk = state.getChunk();

			runner(wmd, chunk, function() {
				state.setChunk(chunk);
				state.restore();
			});
		}
	});
};

// Static functions and properties.
extend(Command, {
	// Common command CSS classes.
	css: {base:"wmd-command", over:"wmd-command-over", down:"wmd-command-down"},

	// Performs an auto-indent command for editing lists, quotes and code.
	autoIndent: function(wmd, chunk, callback, args) {
		args = extend(args, {
			preventDefaultText: true
		});
		
		chunk.before = chunk.before.replace(/(\n|^)[ ]{0,3}([*+-]|\d+[.])[ \t]*\n$/, "\n\n");
		chunk.before = chunk.before.replace(/(\n|^)[ ]{0,3}>[ \t]*\n$/, "\n\n");
		chunk.before = chunk.before.replace(/(\n|^)[ \t]+\n$/, "\n\n");

		if (/(\n|^)[ ]{0,3}([*+-])[ \t]+.*\n$/.test(chunk.before)) {
			Command.runners.ul(wmd, chunk, callback, extend(args, {preventDefaultText:false}));
		} else if (/(\n|^)[ ]{0,3}(\d+[.])[ \t]+.*\n$/.test(chunk.before)) {
			Command.runners.ol(wmd, chunk, callback, extend(args, {preventDefaultText:false}));
		} else if (/(\n|^)[ ]{0,3}>[ \t]+.*\n$/.test(chunk.before)) {
			Command.runners.blockquote(wmd, chunk, callback, args);
		} else if (/(\n|^)(\t|[ ]{4,}).*\n$/.test(chunk.before)) {
			Command.runners.code(wmd, chunk, callback, args);
		} else if (typeof callback === "function") {
			callback();
		}
	},
	
	// Creates and returns a Command instance.
	create: function(wmd, key, definition) {
		return new Command(wmd, definition, Command.runners[key]);
	},
	
	// Creates a spacer that masquerades as a command.
	createSpacer: function(wmd, key, definition) {
		var element = null;
		
		return {
			draw: function(parent) {
				var span;
				
				if (!element) {
					element = document.createElement("li");
					element.className = Command.css.base + " " + definition.css;
					parent.appendChild(element);
					
					span = document.createElement("span");
					element.appendChild(span);
				} else {
					parent.appendChild(element);
				}
				
				return element;
			},
			
			run: function() { }
		};
	},
	
	// Creates a common submit/cancel form dialog.
	createSubmitCancelForm: function(title, onSubmit, onDestroy) {
		var cancel = document.createElement("a"),
			form = new Form(title, {
				dialog: true,
				onSubmit: onSubmit,
				onDestroy: onDestroy
			}),
			submitField = new Field("", "submit", {
				value: "Submit"
			});
		
		form.addField("submit", submitField);
		
		cancel.href = "javascript:void(0);";
		cancel.innerHTML = "cancel";
		cancel.onclick = function() { form.destroy(); };
		
		submitField.insert("&nbsp;or&nbsp;");
		submitField.insert(cancel);
		
		return form;
	},
	
	// Runs a link or image command.
	runLinkImage: function(wmd, chunk, callback, args) {
		var callback = typeof callback === "function" ? callback : function() { };

		function make(link) {
			var linkDef,
				num;
				
			if (link) {
				chunk.startTag = chunk.endTag = "";
				linkDef = " [999]: " + link;
				
				num = LinkHelper.add(chunk, linkDef);
				chunk.startTag = args.tag === "img" ? "![" : "[";
				chunk.endTag = "][" + num + "]";
				
				if (!chunk.selection) {
					if (args.tag === "img") {
						chunk.selection = "alt text";
					} else {
						chunk.selection = "link text";
					}
				}
			}
		}
		
		chunk.trimWhitespace();
		chunk.setTags(/\s*!?\[/, /\][ ]?(?:\n[ ]*)?(\[.*?\])?/);
		
		if (chunk.endTag.length > 1) {
			chunk.startTag = chunk.startTag.replace(/!?\[/, "");
			chunk.endTag = "";
			LinkHelper.add(chunk);
			callback();
		} else if (/\n\n/.test(chunk.selection)) {
			LinkHelper.add(chunk);
			callback();
		} else if (typeof args.prompt === "function") {
			args.prompt(function(link) {
				make(link);
				callback();
			});
		} else {
			make(args.link || null);
			callback();
		}
	},
	
	// Runs a list command (ol or ul).
	runList: function(wmd, chunk, callback, args) {
		var previousItemsRegex = /(\n|^)(([ ]{0,3}([*+-]|\d+[.])[ \t]+.*)(\n.+|\n{2,}([*+-].*|\d+[.])[ \t]+.*|\n{2,}[ \t]+\S.*)*)\n*$/,
			nextItemsRegex = /^\n*(([ ]{0,3}([*+-]|\d+[.])[ \t]+.*)(\n.+|\n{2,}([*+-].*|\d+[.])[ \t]+.*|\n{2,}[ \t]+\S.*)*)\n*/,
			finished = false,
			bullet = "-",
			num = 1,
			hasDigits,
			nLinesBefore,
			prefix,
			nLinesAfter,
			spaces;

		callback = typeof callback === "function" ? callback : function() { };

		// Get the item prefix - e.g. " 1. " for a numbered list, " - " for a bulleted list.
		function getItemPrefix() {
			var prefix;
			
			if(args.tag === "ol") {
				prefix = " " + num + ". ";
				num = num + 1;
			} else {
				prefix = " " + bullet + " ";
			}
			
			return prefix;
		}
		
		// Fixes the prefixes of the other list items.
		function getPrefixedItem(itemText) {
			// The numbering flag is unset when called by autoindent.
			if(args.tag === undefined){
				args.tag = /^\s*\d/.test(itemText) ? "ol" : "ul";
			}
			
			// Renumber/bullet the list element.
			itemText = itemText.replace(/^[ ]{0,3}([*+-]|\d+[.])\s/gm, function( _ ) {
				return getItemPrefix();
			});
				
			return itemText;
		};
		
		chunk.setTags(/(\n|^)*[ ]{0,3}([*+-]|\d+[.])\s+/, null);
		
		if(chunk.before && !/\n$/.test(chunk.before) && !/^\n/.test(chunk.startTag)) {
			chunk.before = chunk.before + chunk.startTag;
			chunk.startTag = "";
		}
		
		if(chunk.startTag) {
			hasDigits = /\d+[.]/.test(chunk.startTag);
			
			chunk.startTag = "";
			chunk.selection = chunk.selection.replace(/\n[ ]{4}/g, "\n");
			chunk.unwrap();
			chunk.addBlankLines();
			
			if(hasDigits) {
				// Have to renumber the bullet points if this is a numbered list.
				chunk.after = chunk.after.replace(nextItemsRegex, getPrefixedItem);
			}
			
			if (hasDigits && args.tag === "ol") {
				finished = true;
			}
		}
		
		if (!finished) {
			nLinesBefore = 1;

			chunk.before = chunk.before.replace(previousItemsRegex, function(itemText) {
					if(/^\s*([*+-])/.test(itemText)) {
						bullet = RegExp.$1;
					}
					
					nLinesBefore = /[^\n]\n\n[^\n]/.test(itemText) ? 1 : 0;
					
					return getPrefixedItem(itemText);
				});

			if(!chunk.selection) {
				chunk.selection = args.preventDefaultText ? " " : "List item";
			}
			
			prefix = getItemPrefix();
			nLinesAfter = 1;

			chunk.after = chunk.after.replace(nextItemsRegex, function(itemText) {
					nLinesAfter = /[^\n]\n\n[^\n]/.test(itemText) ? 1 : 0;
					return getPrefixedItem(itemText);
			});
			
			chunk.trimWhitespace(true);
			chunk.addBlankLines(nLinesBefore, nLinesAfter, true);
			chunk.startTag = prefix;
			spaces = prefix.replace(/./g, " ");
			
			chunk.wrap(wmd.options.lineLength - spaces.length);
			chunk.selection = chunk.selection.replace(/\n/g, "\n" + spaces);
		}
		
		callback();
	},
	
	// Runs a bold or italic command.
	runStrongEm: function(wmd, chunk, callback, args) {
		var starsBefore,
			starsAfter,
			prevStars,
			markup;
		
		callback = typeof callback === "function" ? callback : function() { };	
		
		extend({
			stars: 2
		}, args)
			
		chunk.trimWhitespace();
		chunk.selection = chunk.selection.replace(/\n{2,}/g, "\n");
		
		chunk.before.search(/(\**$)/);
		starsBefore = RegExp.$1;
		
		chunk.after.search(/(^\**)/);
		starsAfter = RegExp.$1;
		
		prevStars = Math.min(starsBefore.length, starsAfter.length);
		
		// Remove stars if already marked up.
		if ((prevStars >= args.stars) && (prevStars !== 2 || args.stars !== 1)) {
			chunk.before = chunk.before.replace(RegExp("[*]{" + args.stars + "}$", ""), "");
			chunk.after = chunk.after.replace(RegExp("^[*]{" + args.stars + "}", ""), "");
		} else if (!chunk.selection && starsAfter) {
			// Move some stuff around?
			chunk.after = chunk.after.replace(/^([*_]*)/, "");
			chunk.before = chunk.before.replace(/(\s?)$/, "");
			chunk.before = chunk.before + starsAfter + RegExp.$1;
		} else {
			if (!chunk.selection && !starsAfter) {
				chunk.selection = args.text || "";
			}
			
			// Add the markup.
			markup = args.stars <= 1 ? "*" : "**";
			chunk.before = chunk.before + markup;
			chunk.after = markup + chunk.after;
		}
		
		callback();
	},
	
	// Built-in command runners.
	runners: {
		// Performs an "a" command.
		a: function(wmd, chunk, callback, args) {
			Command.runLinkImage(wmd, chunk, callback, extend({
				tag: "a",
				prompt: function(onComplete) {
					LinkHelper.createDialog("Insert link", "Link URL", onComplete);
				}
			}, args));
		},
		
		// Performs a "blockquote" command.
		blockquote: function(wmd, chunk, callback, args) {
			args = args || {};
			callback = typeof callback === "function" ? callback : function() { };
			
			chunk.selection = chunk.selection.replace(/^(\n*)([^\r]+?)(\n*)$/, function(totalMatch, newlinesBefore, text, newlinesAfter) {
				chunk.before += newlinesBefore;
				chunk.after = newlinesAfter + chunk.after;
				return text;
			});
			
			chunk.before = chunk.before.replace(/(>[ \t]*)$/, function(totalMatch, blankLine) {
				chunk.selection = blankLine + chunk.selection;
				return "";
			});
			
			chunk.selection = chunk.selection.replace(/^(\s|>)+$/ ,"");
			chunk.selection = chunk.selection || (args.preventDefaultText ? "" : "Blockquote");
			
			if (chunk.before) {
				chunk.before = chunk.before.replace(/\n?$/,"\n");
			}
			
			if (chunk.after) {
				chunk.after = chunk.after.replace(/^\n?/,"\n");
			}

			chunk.before = chunk.before.replace(/(((\n|^)(\n[ \t]*)*>(.+\n)*.*)+(\n[ \t]*)*$)/, function(totalMatch) {
				chunk.startTag = totalMatch;
				return "";
			});

			chunk.after = chunk.after.replace(/^(((\n|^)(\n[ \t]*)*>(.+\n)*.*)+(\n[ \t]*)*)/, function(totalMatch) {
				chunk.endTag = totalMatch;
				return "";
			});
			
			function replaceBlanksInTags(useBracket) {
				var replacement = useBracket ? "> " : "";

				if (chunk.startTag) {
					chunk.startTag = chunk.startTag.replace(/\n((>|\s)*)\n$/, function(totalMatch, markdown) {
						return "\n" + markdown.replace(/^[ ]{0,3}>?[ \t]*$/gm, replacement) + "\n";
					});
				}
				
				if (chunk.endTag) {
					chunk.endTag = chunk.endTag.replace(/^\n((>|\s)*)\n/, function(totalMatch, markdown) {
						return "\n" + markdown.replace(/^[ ]{0,3}>?[ \t]*$/gm, replacement) + "\n";
					});
				}
			}
			
			if (/^(?![ ]{0,3}>)/m.test(chunk.selection)) {
				chunk.wrap(wmd.options.lineLength - 2)
				chunk.selection = chunk.selection.replace(/^/gm, "> ");
				replaceBlanksInTags(true);
				chunk.addBlankLines();
			} else {
				chunk.selection = chunk.selection.replace(/^[ ]{0,3}> ?/gm, "");
				chunk.unwrap();
				replaceBlanksInTags(false);

				if(!/^(\n|^)[ ]{0,3}>/.test(chunk.selection) && chunk.startTag) {
					chunk.startTag = chunk.startTag.replace(/\n{0,2}$/, "\n\n");
				}

				if(!/(\n|^)[ ]{0,3}>.*$/.test(chunk.selection) && chunk.endTag) {
					chunk.endTag = chunk.endTag.replace(/^\n{0,2}/, "\n\n");
				}
			}

			if (!/\n/.test(chunk.selection)) {
				chunk.selection = chunk.selection.replace(/^(> *)/, function(wholeMatch, blanks) {
					chunk.startTag = chunk.startTag + blanks;
					return "";
				});
			}
			
			callback();
		},
		
		// Performs a "code" command.
		code: function(wmd, chunk, callback, args) {
			args = args || {};
			callback = typeof callback === "function" ? callback : function() { };
			
			var textBefore = /\S[ ]*$/.test(chunk.before),
				textAfter = /^[ ]*\S/.test(chunk.after),
				linesBefore = 1,
				linesAfter = 1;
				
			// Use 4-space mode.
			if (!(textBefore && !textAfter) || /\n/.test(chunk.selection)) {
				chunk.before = chunk.before.replace(/[ ]{4}$/, function(totalMatch) {
						chunk.selection = totalMatch + chunk.selection;
						return "";
				});
				
				if (/\n(\t|[ ]{4,}).*\n$/.test(chunk.before) || chunk.after === "" || /^\n(\t|[ ]{4,})/.test(chunk.after)) {
					linesBefore = 0; 
				}
				
				chunk.addBlankLines(linesBefore, linesAfter);
				
				if (!chunk.selection) {
					chunk.startTag = "    ";
					chunk.selection = args.preventDefaultText ? "" : "enter code here";
				} else {
					if (/^[ ]{0,3}\S/m.test(chunk.selection)) {
						chunk.selection = chunk.selection.replace(/^/gm, "    ");
					} else {
						chunk.selection = chunk.selection.replace(/^[ ]{4}/gm, "");
					}
				}
			} else { // Use ` (tick) mode.
				chunk.trimWhitespace();
				chunk.setTags(/`/, /`/);

				if (!chunk.startTag && !chunk.endTag) {
					chunk.startTag = chunk.endTag = "`";
					
					if (!chunk.selection) {
						chunk.selection = args.preventDefaultText ? "" : "enter code here";
					}
				} else if (chunk.endTag && !chunk.startTag) {
					chunk.before = chunk.before + chunk.endTag;
					chunk.endTag = "";
				} else {
					chunk.startTag = chunk.endTag = "";
				}
			}
			
			callback();
		},

		// Performs an "italic" command.
		em: function(wmd, chunk, callback, args) {
			Command.runStrongEm(wmd, chunk, callback, extend({
				stars: 1,
				text: "emphasized text"
			}, args));
		},

		// Performs a "h1.." command.
		h: function(wmd, chunk, callback, args) {
			args = args || {};
			callback = typeof callback === "function" ? callback : function() { };
			
			var headerLevel = 0,
				headerLevelToCreate,
				headerChar,
				len;
			
			// Remove leading/trailing whitespace and reduce internal spaces to single spaces.
			chunk.selection = chunk.selection.replace(/\s+/g, " ");
			chunk.selection = chunk.selection.replace(/(^\s+|\s+$)/g, "");
			
			// If we clicked the button with no selected text, we just
			// make a level 2 hash header around some default text.
			if (!chunk.selection) {
				chunk.startTag = "## ";
				chunk.selection = "Heading";
				chunk.endTag = " ##";
			} else {
				// Remove any existing hash heading markdown and save the header level.
				chunk.setTags(/#+[ ]*/, /[ ]*#+/);
				
				if (/#+/.test(chunk.startTag)) {
					headerLevel = RegExp.lastMatch.length;
				}
				
				chunk.startTag = chunk.endTag = "";
				
				// Try to get the current header level by looking for - and = in the line
				// below the selection.
				chunk.setTags(null, /\s?(-+|=+)/);
				
				if (/=+/.test(chunk.endTag)) {
					headerLevel = 1;
				} else if (/-+/.test(chunk.endTag)) {
					headerLevel = 2;
				}
				
				// Skip to the next line so we can create the header markdown.
				chunk.startTag = chunk.endTag = "";
				chunk.addBlankLines(1, 1);
				
				// We make a level 2 header if there is no current header.
				// If there is a header level, we substract one from the header level.
				// If it's already a level 1 header, it's removed.
				headerLevelToCreate = headerLevel === 0 ? 2 : headerLevel - 1;
				
				if (headerLevelToCreate > 0) {
					headerChar = headerLevelToCreate >= 2 ? "-" : "=";
					len = chunk.selection.length;
					
					if (len > wmd.options.lineLength) {
						len = wmd.options.lineLength;
					}
					
					chunk.endTag = "\n";
					
					while (len > 0) {
						chunk.endTag = chunk.endTag + headerChar;
						len = len - 1;
					}
				}
			}
			
			callback();
		},

		// Performs an "hr" command.
		hr: function(wmd, chunk, callback, args) {
			args = args || {};
			callback = typeof callback === "function" ? callback : function() { };
			
			chunk.startTag = "----------\n";
			chunk.selection = "";
			chunk.addBlankLines(2, 1, true);
			
			callback();
		},
		
		// Performs an "img" command.
		img: function(wmd, chunk, callback, args) {
			Command.runLinkImage(wmd, chunk, callback, extend({
				tag: "img",
				prompt: function(onComplete) {
					LinkHelper.createDialog("Insert image", "Image URL", onComplete);
				}
			}, args));
		},

		// Performs a "ol" command.
		ol: function(wmd, chunk, callback, args) {
			Command.runList(wmd, chunk, callback, extend({
				tag: "ol"
			}, args));
		},
		
		// Performs a "bold" command.
		strong: function(wmd, chunk, callback, args) {
			Command.runStrongEm(wmd, chunk, callback, extend({
				stars: 2,
				text: "strong text"
			}, args));
		},
		
		// Performs a "ul" command.
		ul: function(wmd, chunk, callback, args) {
			Command.runList(wmd, chunk, callback, extend({
				tag: "ul"
			}, args));
		}
	}
});

// Built-in command lookup table.
Command.builtIn = {
	"strong": {text:"Bold", title:"Strong <strong> Ctl+B", css:"wmd-strong", shortcut:"b"},
	"em": {text:"Italic", title:"Emphasis <em> Ctl+I", css:"wmd-em", shortcut:"i"},
	"a": {text:"Link", title:"Hyperlink <a> Ctl+L", css:"wmd-a", shortcut:"l"},
	"blockquote": {text:"Blockquote", title:"Blockquote <blockquote> Ctl+Q", css:"wmd-blockquote", shortcut:"q"},
	"code": {text:"Code", title:"Code Sample <pre><code> Ctl+K", css:"wmd-code", shortcut:"k"},
	"img": {text:"Image", title:"Image <img> Ctl+G", css:"wmd-img", shortcut:"g"},
	"ol": {text:"Numbered List", title:"Numbered List <ol> Ctl+O", css:"wmd-ol", shortcut:"o"},
	"ul": {text:"Bulleted List", title:"Bulleted List <ul> Ctl+U", css:"wmd-ul", shortcut:"u"},
	"h": {text:"Headeing", title:"Heading <h1>/<h2> Ctl+H", css:"wmd-h", shortcut:"h"},
	"hr": {text:"Horizontal Rule", title:"Horizontal Rule <hr> Ctl+R", css:"wmd-hr", shortcut:"r"},
	"spacer": {css:"wmd-spacer", builder:Command.createSpacer}
};