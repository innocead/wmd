//
// Provides static function for helping with managing
// links in a WMD editor.
//
LinkHelper = {
	// Adds a link definition to the given chunk.
	add: function(chunk, linkDef) {
		var refNumber = 0,
			defsToAdd = {},
			defs = "",
			regex = /(\[(?:\[[^\]]*\]|[^\[\]])*\][ ]?(?:\n[ ]*)?\[)(\d+)(\])/g;
			
		function addDefNumber(def) {
			refNumber = refNumber + 1;
			def = def.replace(/^[ ]{0,3}\[(\d+)\]:/, "  [" + refNumber + "]:");
			defs += "\n" + def;
		}
		
		function getLink(totalMatch, link, id, end) {
			var result = "";
			
			if (defsToAdd[id]) {
				addDefNumber(defsToAdd[id]);
				result = link + refNumber + end;
			} else {
				result = totalMatch;
			}
			
			return result;
		}
		
		// Start with a clean slate by removing all previous link definitions.
		chunk.before = LinkHelper.strip(chunk.before, defsToAdd);
		chunk.selection = LinkHelper.strip(chunk.selection, defsToAdd);
		chunk.after = LinkHelper.strip(chunk.after, defsToAdd);
		
		chunk.before = chunk.before.replace(regex, getLink);
		
		if (linkDef) {
			addDefNumber(linkDef);
		} else {
			chunk.selection = chunk.selection.replace(regex, getLink);
		}

		chunk.after = chunk.after.replace(regex, getLink);
		
		if (chunk.after) {
			chunk.after = chunk.after.replace(/\n*$/, "");
		}
		
		if (!chunk.after) {
			chunk.selection = chunk.selection.replace(/\n*$/, "");
		}
		
		chunk.after = chunk.after + "\n\n" + defs;
		
		return refNumber;
	},
	
	// Creates a dialog that prompts the user for a link URL.
	createDialog: function(formTitle, fieldLabel, callback) {
		var form,
			urlField,
			submitted = false;
			
		callback = typeof callback === "function" ? callback : function() { };

		form = Command.createSubmitCancelForm(formTitle, function() {
			var values = form.serialize(true);
			
			if (values) {
				submitted = true;
				form.destroy();
			
				callback(values.url);
			}
		}, function() {
			if (!submitted) {
				callback("");
			}
		});
		
		urlField = new Field(fieldLabel, "text", {
			required: true,
			value: "http://",
			insertion: Translator.urlFieldInsertion
		});
		
		form.insertField(0, "url", urlField);
		urlField.focus();
	},
	
	// Strips and caches links from the given text.
	strip: function(text, defsToAdd) {
		var expr = /^[ ]{0,3}\[(\d+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)["(](.+?)[")][ \t]*)?(?:\n+|$)/gm;
		
		text = text.replace(expr, function(totalMatch, id, link, newLines, title) {
			var result = "";
			
			defsToAdd[id] = totalMatch.replace(/\s*$/, "");
			
			if (newLines) {
				defsToAdd[id] = totalMatch.replace(/["(](.+?)[")]$/, "");
				result = newLines + title;
			}
			
			return result;
		});
		
		return text;
	}
};