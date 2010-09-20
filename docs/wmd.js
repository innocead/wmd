//
// showdown.js -- A javascript port of Markdown.
//
// Copyright (c) 2007 John Fraser.
//
// Original Markdown Copyright (c) 2004-2005 John Gruber
//   <http://daringfireball.net/projects/markdown/>
//
// The full source distribution is at:
//
//				A A L
//				T C A
//				T K B
//
//   <http://www.attacklab.net/>
//

//
// Wherever possible, Showdown is a straight, line-by-line port
// of the Perl version of Markdown.
//
// This is not a normal parser design; it's basically just a
// series of string substitutions.  It's hard to read and
// maintain this way,  but keeping Showdown close to the original
// design makes it easier to port new features.
//
// More importantly, Showdown behaves like markdown.pl in most
// edge cases.  So web applications can do client-side preview
// in Javascript, and then build identical HTML on the server.
//
// This port needs the new RegExp functionality of ECMA 262,
// 3rd Edition (i.e. Javascript 1.5).  Most modern web browsers
// should do fine.  Even with the new regular expression features,
// We do a lot of work to emulate Perl's regex functionality.
// The tricky changes in this file mostly have the "attacklab:"
// label.  Major or self-explanatory changes don't.
//
// Smart diff tools like Araxis Merge will be able to match up
// this file with markdown.pl in a useful way.  A little tweaking
// helps: in a copy of markdown.pl, replace "#" with "//" and
// replace "$text" with "text".  Be sure to ignore whitespace
// and line endings.
//


//
// Showdown usage:
//
//   var text = "Markdown *rocks*.";
//
//   var converter = new Attacklab.showdown.converter();
//   var html = converter.makeHtml(text);
//
//   alert(html);
//
// Note: move the sample code to the bottom of this
// file before uncommenting it.
//


//
// Attacklab namespace
//
var Attacklab = Attacklab || {}

//
// Showdown namespace
//
Attacklab.showdown = Attacklab.showdown || {}

//
// converter
//
// Wraps all "globals" so that the only thing
// exposed is makeHtml().
//
Attacklab.showdown.converter = function() {

//
// Globals:
//

// Global hashes, used by various utility routines
var g_urls;
var g_titles;
var g_html_blocks;

// Used to track when we're inside an ordered or unordered list
// (see _ProcessListItems() for details):
var g_list_level = 0;


this.makeHtml = function(text) {
//
// Main function. The order in which other subs are called here is
// essential. Link and image substitutions need to happen before
// _EscapeSpecialCharsWithinTagAttributes(), so that any *'s or _'s in the <a>
// and <img> tags get encoded.
//

	// Clear the global hashes. If we don't clear these, you get conflicts
	// from other articles when generating a page which contains more than
	// one article (e.g. an index page that shows the N most recent
	// articles):
	g_urls = new Array();
	g_titles = new Array();
	g_html_blocks = new Array();

	// attacklab: Replace ~ with ~T
	// This lets us use tilde as an escape char to avoid md5 hashes
	// The choice of character is arbitray; anything that isn't
    // magic in Markdown will work.
	text = text.replace(/~/g,"~T");

	// attacklab: Replace $ with ~D
	// RegExp interprets $ as a special character
	// when it's in a replacement string
	text = text.replace(/\$/g,"~D");

	// Standardize line endings
	text = text.replace(/\r\n/g,"\n"); // DOS to Unix
	text = text.replace(/\r/g,"\n"); // Mac to Unix

	// Make sure text begins and ends with a couple of newlines:
	text = "\n\n" + text + "\n\n";

	// Convert all tabs to spaces.
	text = _Detab(text);

	// Strip any lines consisting only of spaces and tabs.
	// This makes subsequent regexen easier to write, because we can
	// match consecutive blank lines with /\n+/ instead of something
	// contorted like /[ \t]*\n+/ .
	text = text.replace(/^[ \t]+$/mg,"");

	// Turn block-level HTML blocks into hash entries
	text = _HashHTMLBlocks(text);

	// Strip link definitions, store in hashes.
	text = _StripLinkDefinitions(text);

	text = _RunBlockGamut(text);

	text = _UnescapeSpecialChars(text);

	// attacklab: Restore dollar signs
	text = text.replace(/~D/g,"$$");

	// attacklab: Restore tildes
	text = text.replace(/~T/g,"~");

	return text;
}

var _StripLinkDefinitions = function(text) {
//
// Strips link definitions from text, stores the URLs and titles in
// hash references.
//

	// Link defs are in the form: ^[id]: url "optional title"

	/*
		var text = text.replace(/
				^[ ]{0,3}\[(.+)\]:  // id = $1  attacklab: g_tab_width - 1
				  [ \t]*
				  \n?				// maybe *one* newline
				  [ \t]*
				<?(\S+?)>?			// url = $2
				  [ \t]*
				  \n?				// maybe one newline
				  [ \t]*
				(?:
				  (\n*)				// any lines skipped = $3 attacklab: lookbehind removed
				  ["(]
				  (.+?)				// title = $4
				  [")]
				  [ \t]*
				)?					// title is optional
				(?:\n+|$)
			  /gm,
			  function(){...});
	*/
	var text = text.replace(/^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)["(](.+?)[")][ \t]*)?(?:\n+)/gm,
		function (wholeMatch,m1,m2,m3,m4) {
			m1 = m1.toLowerCase();
			g_urls[m1] = _EncodeAmpsAndAngles(m2);  // Link IDs are case-insensitive
			if (m3) {
				// Oops, found blank lines, so it's not a title.
				// Put back the parenthetical statement we stole.
				return m3+m4;
			} else if (m4) {
				g_titles[m1] = m4.replace(/"/g,"&quot;");
			}
			
			// Completely remove the definition from the text
			return "";
		}
	);

	return text;
}

var _HashHTMLBlocks = function(text) {
	// attacklab: Double up blank lines to reduce lookaround
	text = text.replace(/\n/g,"\n\n");

	// Hashify HTML blocks:
	// We only want to do this for block-level HTML tags, such as headers,
	// lists, and tables. That's because we still want to wrap <p>s around
	// "paragraphs" that are wrapped in non-block-level tags, such as anchors,
	// phrase emphasis, and spans. The list of tags we're looking for is
	// hard-coded:
	var block_tags_a = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del"
	var block_tags_b = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math"

	// First, look for nested blocks, e.g.:
	//   <div>
	//     <div>
	//     tags for inner block must be indented.
	//     </div>
	//   </div>
	//
	// The outermost tags must start at the left margin for this to match, and
	// the inner nested divs must be indented.
	// We need to do this before the next, more liberal match, because the next
	// match will start at the first `<div>` and stop at the first `</div>`.

	// attacklab: This regex can be expensive when it fails.
	/*
		var text = text.replace(/
		(						// save in $1
			^					// start of line  (with /m)
			<($block_tags_a)	// start tag = $2
			\b					// word break
								// attacklab: hack around khtml/pcre bug...
			[^\r]*?\n			// any number of lines, minimally matching
			</\2>				// the matching end tag
			[ \t]*				// trailing spaces/tabs
			(?=\n+)				// followed by a newline
		)						// attacklab: there are sentinel newlines at end of document
		/gm,function(){...}};
	*/
	text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)\b[^\r]*?\n<\/\2>[ \t]*(?=\n+))/gm,hashElement);

	//
	// Now match more liberally, simply from `\n<tag>` to `</tag>\n`
	//

	/*
		var text = text.replace(/
		(						// save in $1
			^					// start of line  (with /m)
			<($block_tags_b)	// start tag = $2
			\b					// word break
								// attacklab: hack around khtml/pcre bug...
			[^\r]*?				// any number of lines, minimally matching
			.*</\2>				// the matching end tag
			[ \t]*				// trailing spaces/tabs
			(?=\n+)				// followed by a newline
		)						// attacklab: there are sentinel newlines at end of document
		/gm,function(){...}};
	*/
	text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math)\b[^\r]*?.*<\/\2>[ \t]*(?=\n+)\n)/gm,hashElement);

	// Special case just for <hr />. It was easier to make a special case than
	// to make the other regex more complicated.  

	/*
		text = text.replace(/
		(						// save in $1
			\n\n				// Starting after a blank line
			[ ]{0,3}
			(<(hr)				// start tag = $2
			\b					// word break
			([^<>])*?			// 
			\/?>)				// the matching end tag
			[ \t]*
			(?=\n{2,})			// followed by a blank line
		)
		/g,hashElement);
	*/
	text = text.replace(/(\n[ ]{0,3}(<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g,hashElement);

	// Special case for standalone HTML comments:

	/*
		text = text.replace(/
		(						// save in $1
			\n\n				// Starting after a blank line
			[ ]{0,3}			// attacklab: g_tab_width - 1
			<!
			(--[^\r]*?--\s*)+
			>
			[ \t]*
			(?=\n{2,})			// followed by a blank line
		)
		/g,hashElement);
	*/
	text = text.replace(/(\n\n[ ]{0,3}<!(--[^\r]*?--\s*)+>[ \t]*(?=\n{2,}))/g,hashElement);

	// PHP and ASP-style processor instructions (<?...?> and <%...%>)

	/*
		text = text.replace(/
		(?:
			\n\n				// Starting after a blank line
		)
		(						// save in $1
			[ ]{0,3}			// attacklab: g_tab_width - 1
			(?:
				<([?%])			// $2
				[^\r]*?
				\2>
			)
			[ \t]*
			(?=\n{2,})			// followed by a blank line
		)
		/g,hashElement);
	*/
	text = text.replace(/(?:\n\n)([ ]{0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g,hashElement);

	// attacklab: Undo double lines (see comment at top of this function)
	text = text.replace(/\n\n/g,"\n");
	return text;
}

var hashElement = function(wholeMatch,m1) {
	var blockText = m1;

	// Undo double lines
	blockText = blockText.replace(/\n\n/g,"\n");
	blockText = blockText.replace(/^\n/,"");
	
	// strip trailing blank lines
	blockText = blockText.replace(/\n+$/g,"");
	
	// Replace the element text with a marker ("~KxK" where x is its key)
	blockText = "\n\n~K" + (g_html_blocks.push(blockText)-1) + "K\n\n";
	
	return blockText;
};

var _RunBlockGamut = function(text) {
//
// These are all the transformations that form block-level
// tags like paragraphs, headers, and list items.
//
	text = _DoHeaders(text);

	// Do Horizontal Rules:
	var key = hashBlock("<hr />");
	text = text.replace(/^[ ]{0,2}([ ]?\*[ ]?){3,}[ \t]*$/gm,key);
	text = text.replace(/^[ ]{0,2}([ ]?-[ ]?){3,}[ \t]*$/gm,key);
	text = text.replace(/^[ ]{0,2}([ ]?_[ ]?){3,}[ \t]*$/gm,key);

	text = _DoLists(text);
	text = _DoCodeBlocks(text);
	text = _DoBlockQuotes(text);

	// We already ran _HashHTMLBlocks() before, in Markdown(), but that
	// was to escape raw HTML in the original Markdown source. This time,
	// we're escaping the markup we've just created, so that we don't wrap
	// <p> tags around block-level tags.
	text = _HashHTMLBlocks(text);
	text = _FormParagraphs(text);

	return text;
}


var _RunSpanGamut = function(text) {
//
// These are all the transformations that occur *within* block-level
// tags like paragraphs, headers, and list items.
//

	text = _DoCodeSpans(text);
	text = _EscapeSpecialCharsWithinTagAttributes(text);
	text = _EncodeBackslashEscapes(text);

	// Process anchor and image tags. Images must come first,
	// because ![foo][f] looks like an anchor.
	text = _DoImages(text);
	text = _DoAnchors(text);

	// Make links out of things like `<http://example.com/>`
	// Must come after _DoAnchors(), because you can use < and >
	// delimiters in inline links like [this](<url>).
	text = _DoAutoLinks(text);
	text = _EncodeAmpsAndAngles(text);
	text = _DoItalicsAndBold(text);

	// Do hard breaks:
	text = text.replace(/  +\n/g," <br />\n");

	return text;
}

var _EscapeSpecialCharsWithinTagAttributes = function(text) {
//
// Within tags -- meaning between < and > -- encode [\ ` * _] so they
// don't conflict with their use in Markdown for code, italics and strong.
//

	// Build a regex to find HTML tags and comments.  See Friedl's 
	// "Mastering Regular Expressions", 2nd Ed., pp. 200-201.
	var regex = /(<[a-z\/!$]("[^"]*"|'[^']*'|[^'">])*>|<!(--.*?--\s*)+>)/gi;

	text = text.replace(regex, function(wholeMatch) {
		var tag = wholeMatch.replace(/(.)<\/?code>(?=.)/g,"$1`");
		tag = escapeCharacters(tag,"\\`*_");
		return tag;
	});

	return text;
}

var _DoAnchors = function(text) {
//
// Turn Markdown link shortcuts into XHTML <a> tags.
//
	//
	// First, handle reference-style links: [link text] [id]
	//

	/*
		text = text.replace(/
		(							// wrap whole match in $1
			\[
			(
				(?:
					\[[^\]]*\]		// allow brackets nested one level
					|
					[^\[]			// or anything else
				)*
			)
			\]

			[ ]?					// one optional space
			(?:\n[ ]*)?				// one optional newline followed by spaces

			\[
			(.*?)					// id = $3
			\]
		)()()()()					// pad remaining backreferences
		/g,_DoAnchors_callback);
	*/
	text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,writeAnchorTag);

	//
	// Next, inline-style links: [link text](url "optional title")
	//

	/*
		text = text.replace(/
			(						// wrap whole match in $1
				\[
				(
					(?:
						\[[^\]]*\]	// allow brackets nested one level
					|
					[^\[\]]			// or anything else
				)
			)
			\]
			\(						// literal paren
			[ \t]*
			()						// no id, so leave $3 empty
			<?(.*?)>?				// href = $4
			[ \t]*
			(						// $5
				(['"])				// quote char = $6
				(.*?)				// Title = $7
				\6					// matching quote
				[ \t]*				// ignore any spaces/tabs between closing quote and )
			)?						// title is optional
			\)
		)
		/g,writeAnchorTag);
	*/
	text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\]\([ \t]*()<?(.*?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g,writeAnchorTag);

	//
	// Last, handle reference-style shortcuts: [link text]
	// These must come last in case you've also got [link test][1]
	// or [link test](/foo)
	//

	/*
		text = text.replace(/
		(		 					// wrap whole match in $1
			\[
			([^\[\]]+)				// link text = $2; can't contain '[' or ']'
			\]
		)()()()()()					// pad rest of backreferences
		/g, writeAnchorTag);
	*/
	text = text.replace(/(\[([^\[\]]+)\])()()()()()/g, writeAnchorTag);

	return text;
}

var writeAnchorTag = function(wholeMatch,m1,m2,m3,m4,m5,m6,m7) {
	if (m7 == undefined) m7 = "";
	var whole_match = m1;
	var link_text   = m2;
	var link_id	 = m3.toLowerCase();
	var url		= m4;
	var title	= m7;
	
	if (url == "") {
		if (link_id == "") {
			// lower-case and turn embedded newlines into spaces
			link_id = link_text.toLowerCase().replace(/ ?\n/g," ");
		}
		url = "#"+link_id;
		
		if (g_urls[link_id] != undefined) {
			url = g_urls[link_id];
			if (g_titles[link_id] != undefined) {
				title = g_titles[link_id];
			}
		}
		else {
			if (whole_match.search(/\(\s*\)$/m)>-1) {
				// Special case for explicit empty url
				url = "";
			} else {
				return whole_match;
			}
		}
	}	
	
	url = escapeCharacters(url,"*_");
	var result = "<a href=\"" + url + "\"";
	
	if (title != "") {
		title = title.replace(/"/g,"&quot;");
		title = escapeCharacters(title,"*_");
		result +=  " title=\"" + title + "\"";
	}
	
	result += ">" + link_text + "</a>";
	
	return result;
}


var _DoImages = function(text) {
//
// Turn Markdown image shortcuts into <img> tags.
//

	//
	// First, handle reference-style labeled images: ![alt text][id]
	//

	/*
		text = text.replace(/
		(						// wrap whole match in $1
			!\[
			(.*?)				// alt text = $2
			\]

			[ ]?				// one optional space
			(?:\n[ ]*)?			// one optional newline followed by spaces

			\[
			(.*?)				// id = $3
			\]
		)()()()()				// pad rest of backreferences
		/g,writeImageTag);
	*/
	text = text.replace(/(!\[(.*?)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,writeImageTag);

	//
	// Next, handle inline images:  ![alt text](url "optional title")
	// Don't forget: encode * and _

	/*
		text = text.replace(/
		(						// wrap whole match in $1
			!\[
			(.*?)				// alt text = $2
			\]
			\s?					// One optional whitespace character
			\(					// literal paren
			[ \t]*
			()					// no id, so leave $3 empty
			<?(\S+?)>?			// src url = $4
			[ \t]*
			(					// $5
				(['"])			// quote char = $6
				(.*?)			// title = $7
				\6				// matching quote
				[ \t]*
			)?					// title is optional
		\)
		)
		/g,writeImageTag);
	*/
	text = text.replace(/(!\[(.*?)\]\s?\([ \t]*()<?(\S+?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g,writeImageTag);

	return text;
}

var writeImageTag = function(wholeMatch,m1,m2,m3,m4,m5,m6,m7) {
	var whole_match = m1;
	var alt_text   = m2;
	var link_id	 = m3.toLowerCase();
	var url		= m4;
	var title	= m7;

	if (!title) title = "";
	
	if (url == "") {
		if (link_id == "") {
			// lower-case and turn embedded newlines into spaces
			link_id = alt_text.toLowerCase().replace(/ ?\n/g," ");
		}
		url = "#"+link_id;
		
		if (g_urls[link_id] != undefined) {
			url = g_urls[link_id];
			if (g_titles[link_id] != undefined) {
				title = g_titles[link_id];
			}
		}
		else {
			return whole_match;
		}
	}	
	
	alt_text = alt_text.replace(/"/g,"&quot;");
	url = escapeCharacters(url,"*_");
	var result = "<img src=\"" + url + "\" alt=\"" + alt_text + "\"";

	// attacklab: Markdown.pl adds empty title attributes to images.
	// Replicate this bug.

	//if (title != "") {
		title = title.replace(/"/g,"&quot;");
		title = escapeCharacters(title,"*_");
		result +=  " title=\"" + title + "\"";
	//}
	
	result += " />";
	
	return result;
}


var _DoHeaders = function(text) {

	// Setext-style headers:
	//	Header 1
	//	========
	//  
	//	Header 2
	//	--------
	//
	text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm,
		function(wholeMatch,m1){return hashBlock("<h1>" + _RunSpanGamut(m1) + "</h1>");});

	text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm,
		function(matchFound,m1){return hashBlock("<h2>" + _RunSpanGamut(m1) + "</h2>");});

	// atx-style headers:
	//  # Header 1
	//  ## Header 2
	//  ## Header 2 with closing hashes ##
	//  ...
	//  ###### Header 6
	//

	/*
		text = text.replace(/
			^(\#{1,6})				// $1 = string of #'s
			[ \t]*
			(.+?)					// $2 = Header text
			[ \t]*
			\#*						// optional closing #'s (not counted)
			\n+
		/gm, function() {...});
	*/

	text = text.replace(/^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm,
		function(wholeMatch,m1,m2) {
			var h_level = m1.length;
			return hashBlock("<h" + h_level + ">" + _RunSpanGamut(m2) + "</h" + h_level + ">");
		});

	return text;
}

// This declaration keeps Dojo compressor from outputting garbage:
var _ProcessListItems;

var _DoLists = function(text) {
//
// Form HTML ordered (numbered) and unordered (bulleted) lists.
//

	// attacklab: add sentinel to hack around khtml/safari bug:
	// http://bugs.webkit.org/show_bug.cgi?id=11231
	text += "~0";

	// Re-usable pattern to match any entirel ul or ol list:

	/*
		var whole_list = /
		(									// $1 = whole list
			(								// $2
				[ ]{0,3}					// attacklab: g_tab_width - 1
				([*+-]|\d+[.])				// $3 = first list item marker
				[ \t]+
			)
			[^\r]+?
			(								// $4
				~0							// sentinel for workaround; should be $
			|
				\n{2,}
				(?=\S)
				(?!							// Negative lookahead for another list item marker
					[ \t]*
					(?:[*+-]|\d+[.])[ \t]+
				)
			)
		)/g
	*/
	var whole_list = /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;

	if (g_list_level) {
		text = text.replace(whole_list,function(wholeMatch,m1,m2) {
			var list = m1;
			var list_type = (m2.search(/[*+-]/g)>-1) ? "ul" : "ol";

			// Turn double returns into triple returns, so that we can make a
			// paragraph for the last item in a list, if necessary:
			list = list.replace(/\n{2,}/g,"\n\n\n");;
			var result = _ProcessListItems(list);
	
			// Trim any trailing whitespace, to put the closing `</$list_type>`
			// up on the preceding line, to get it past the current stupid
			// HTML block parser. This is a hack to work around the terrible
			// hack that is the HTML block parser.
			result = result.replace(/\s+$/,"");
			result = "<"+list_type+">" + result + "</"+list_type+">\n";
			return result;
		});
	} else {
		whole_list = /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g;
		text = text.replace(whole_list,function(wholeMatch,m1,m2,m3) {
			var runup = m1;
			var list = m2;

			var list_type = (m3.search(/[*+-]/g)>-1) ? "ul" : "ol";
			// Turn double returns into triple returns, so that we can make a
			// paragraph for the last item in a list, if necessary:
			var list = list.replace(/\n{2,}/g,"\n\n\n");;
			var result = _ProcessListItems(list);
			result = runup + "<"+list_type+">\n" + result + "</"+list_type+">\n";	
			return result;
		});
	}

	// attacklab: strip sentinel
	text = text.replace(/~0/,"");

	return text;
}

_ProcessListItems = function(list_str) {
//
//  Process the contents of a single ordered or unordered list, splitting it
//  into individual list items.
//
	// The $g_list_level global keeps track of when we're inside a list.
	// Each time we enter a list, we increment it; when we leave a list,
	// we decrement. If it's zero, we're not in a list anymore.
	//
	// We do this because when we're not inside a list, we want to treat
	// something like this:
	//
	//    I recommend upgrading to version
	//    8. Oops, now this line is treated
	//    as a sub-list.
	//
	// As a single paragraph, despite the fact that the second line starts
	// with a digit-period-space sequence.
	//
	// Whereas when we're inside a list (or sub-list), that line will be
	// treated as the start of a sub-list. What a kludge, huh? This is
	// an aspect of Markdown's syntax that's hard to parse perfectly
	// without resorting to mind-reading. Perhaps the solution is to
	// change the syntax rules such that sub-lists must start with a
	// starting cardinal number; e.g. "1." or "a.".

	g_list_level++;

	// trim trailing blank lines:
	list_str = list_str.replace(/\n{2,}$/,"\n");

	// attacklab: add sentinel to emulate \z
	list_str += "~0";

	/*
		list_str = list_str.replace(/
			(\n)?							// leading line = $1
			(^[ \t]*)						// leading whitespace = $2
			([*+-]|\d+[.]) [ \t]+			// list marker = $3
			([^\r]+?						// list item text   = $4
			(\n{1,2}))
			(?= \n* (~0 | \2 ([*+-]|\d+[.]) [ \t]+))
		/gm, function(){...});
	*/
	list_str = list_str.replace(/(\n)?(^[ \t]*)([*+-]|\d+[.])[ \t]+([^\r]+?(\n{1,2}))(?=\n*(~0|\2([*+-]|\d+[.])[ \t]+))/gm,
		function(wholeMatch,m1,m2,m3,m4){
			var item = m4;
			var leading_line = m1;
			var leading_space = m2;

			if (leading_line || (item.search(/\n{2,}/)>-1)) {
				item = _RunBlockGamut(_Outdent(item));
			}
			else {
				// Recursion for sub-lists:
				item = _DoLists(_Outdent(item));
				item = item.replace(/\n$/,""); // chomp(item)
				item = _RunSpanGamut(item);
			}

			return  "<li>" + item + "</li>\n";
		}
	);

	// attacklab: strip sentinel
	list_str = list_str.replace(/~0/g,"");

	g_list_level--;
	return list_str;
}


var _DoCodeBlocks = function(text) {
//
//  Process Markdown `<pre><code>` blocks.
//  

	/*
		text = text.replace(text,
			/(?:\n\n|^)
			(								// $1 = the code block -- one or more lines, starting with a space/tab
				(?:
					(?:[ ]{4}|\t)			// Lines must start with a tab or a tab-width of spaces - attacklab: g_tab_width
					.*\n+
				)+
			)
			(\n*[ ]{0,3}[^ \t\n]|(?=~0))	// attacklab: g_tab_width
		/g,function(){...});
	*/

	// attacklab: sentinel workarounds for lack of \A and \Z, safari\khtml bug
	text += "~0";
	
	text = text.replace(/(?:\n\n|^)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
		function(wholeMatch,m1,m2) {
			var codeblock = m1;
			var nextChar = m2;
		
			codeblock = _EncodeCode( _Outdent(codeblock));
			codeblock = _Detab(codeblock);
			codeblock = codeblock.replace(/^\n+/g,""); // trim leading newlines
			codeblock = codeblock.replace(/\n+$/g,""); // trim trailing whitespace

			codeblock = "<pre><code>" + codeblock + "\n</code></pre>";

			return hashBlock(codeblock) + nextChar;
		}
	);

	// attacklab: strip sentinel
	text = text.replace(/~0/,"");

	return text;
}

var hashBlock = function(text) {
	text = text.replace(/(^\n+|\n+$)/g,"");
	return "\n\n~K" + (g_html_blocks.push(text)-1) + "K\n\n";
}


var _DoCodeSpans = function(text) {
//
//   *  Backtick quotes are used for <code></code> spans.
// 
//   *  You can use multiple backticks as the delimiters if you want to
//	 include literal backticks in the code span. So, this input:
//	 
//		 Just type ``foo `bar` baz`` at the prompt.
//	 
//	   Will translate to:
//	 
//		 <p>Just type <code>foo `bar` baz</code> at the prompt.</p>
//	 
//	There's no arbitrary limit to the number of backticks you
//	can use as delimters. If you need three consecutive backticks
//	in your code, use four for delimiters, etc.
//
//  *  You can use spaces to get literal backticks at the edges:
//	 
//		 ... type `` `bar` `` ...
//	 
//	   Turns to:
//	 
//		 ... type <code>`bar`</code> ...
//

	/*
		text = text.replace(/
			(^|[^\\])					// Character before opening ` can't be a backslash
			(`+)						// $2 = Opening run of `
			(							// $3 = The code block
				[^\r]*?
				[^`]					// attacklab: work around lack of lookbehind
			)
			\2							// Matching closer
			(?!`)
		/gm, function(){...});
	*/

	text = text.replace(/(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm,
		function(wholeMatch,m1,m2,m3,m4) {
			var c = m3;
			c = c.replace(/^([ \t]*)/g,"");	// leading whitespace
			c = c.replace(/[ \t]*$/g,"");	// trailing whitespace
			c = _EncodeCode(c);
			return m1+"<code>"+c+"</code>";
		});

	return text;
}


var _EncodeCode = function(text) {
//
// Encode/escape certain characters inside Markdown code runs.
// The point is that in code, these characters are literals,
// and lose their special Markdown meanings.
//
	// Encode all ampersands; HTML entities are not
	// entities within a Markdown code span.
	text = text.replace(/&/g,"&amp;");

	// Do the angle bracket song and dance:
	text = text.replace(/</g,"&lt;");
	text = text.replace(/>/g,"&gt;");

	// Now, escape characters that are magic in Markdown:
	text = escapeCharacters(text,"\*_{}[]\\",false);

// jj the line above breaks this:
//---

//* Item

//   1. Subitem

//            special char: *
//---

	return text;
}


var _DoItalicsAndBold = function(text) {

	// <strong> must go first:
	text = text.replace(/(\*\*|__)(?=\S)([^\r]*?\S[\*_]*)\1/g,
		"<strong>$2</strong>");

	text = text.replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g,
		"<em>$2</em>");

	return text;
}


var _DoBlockQuotes = function(text) {

	/*
		text = text.replace(/
		(								// Wrap whole match in $1
			(
				^[ \t]*>[ \t]?			// '>' at the start of a line
				.+\n					// rest of the first line
				(.+\n)*					// subsequent consecutive lines
				\n*						// blanks
			)+
		)
		/gm, function(){...});
	*/

	text = text.replace(/((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
		function(wholeMatch,m1) {
			var bq = m1;

			// attacklab: hack around Konqueror 3.5.4 bug:
			// "----------bug".replace(/^-/g,"") == "bug"

			bq = bq.replace(/^[ \t]*>[ \t]?/gm,"~0");	// trim one level of quoting

			// attacklab: clean up hack
			bq = bq.replace(/~0/g,"");

			bq = bq.replace(/^[ \t]+$/gm,"");		// trim whitespace-only lines
			bq = _RunBlockGamut(bq);				// recurse
			
			bq = bq.replace(/(^|\n)/g,"$1  ");
			// These leading spaces screw with <pre> content, so we need to fix that:
			bq = bq.replace(
					/(\s*<pre>[^\r]+?<\/pre>)/gm,
				function(wholeMatch,m1) {
					var pre = m1;
					// attacklab: hack around Konqueror 3.5.4 bug:
					pre = pre.replace(/^  /mg,"~0");
					pre = pre.replace(/~0/g,"");
					return pre;
				});
			
			return hashBlock("<blockquote>\n" + bq + "\n</blockquote>");
		});
	return text;
}


var _FormParagraphs = function(text) {
//
//  Params:
//    $text - string to process with html <p> tags
//

	// Strip leading and trailing lines:
	text = text.replace(/^\n+/g,"");
	text = text.replace(/\n+$/g,"");

	var grafs = text.split(/\n{2,}/g);
	var grafsOut = new Array();

	//
	// Wrap <p> tags.
	//
	var end = grafs.length;
	for (var i=0; i<end; i++) {
		var str = grafs[i];

		// if this is an HTML marker, copy it
		if (str.search(/~K(\d+)K/g) >= 0) {
			grafsOut.push(str);
		}
		else if (str.search(/\S/) >= 0) {
			str = _RunSpanGamut(str);
			str = str.replace(/^([ \t]*)/g,"<p>");
			str += "</p>"
			grafsOut.push(str);
		}

	}

	//
	// Unhashify HTML blocks
	//
	end = grafsOut.length;
	for (var i=0; i<end; i++) {
		// if this is a marker for an html block...
		while (grafsOut[i].search(/~K(\d+)K/) >= 0) {
			var blockText = g_html_blocks[RegExp.$1];
			blockText = blockText.replace(/\$/g,"$$$$"); // Escape any dollar signs
			grafsOut[i] = grafsOut[i].replace(/~K\d+K/,blockText);
		}
	}

	return grafsOut.join("\n\n");
}


var _EncodeAmpsAndAngles = function(text) {
// Smart processing for ampersands and angle brackets that need to be encoded.
	
	// Ampersand-encoding based entirely on Nat Irons's Amputator MT plugin:
	//   http://bumppo.net/projects/amputator/
	text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g,"&amp;");
	
	// Encode naked <'s
	text = text.replace(/<(?![a-z\/?\$!])/gi,"&lt;");
	
	return text;
}


var _EncodeBackslashEscapes = function(text) {
//
//   Parameter:  String.
//   Returns:	The string, with after processing the following backslash
//			   escape sequences.
//

	// attacklab: The polite way to do this is with the new
	// escapeCharacters() function:
	//
	// 	text = escapeCharacters(text,"\\",true);
	// 	text = escapeCharacters(text,"`*_{}[]()>#+-.!",true);
	//
	// ...but we're sidestepping its use of the (slow) RegExp constructor
	// as an optimization for Firefox.  This function gets called a LOT.

	text = text.replace(/\\(\\)/g,escapeCharacters_callback);
	text = text.replace(/\\([`*_{}\[\]()>#+-.!])/g,escapeCharacters_callback);
	return text;
}


var _DoAutoLinks = function(text) {

	text = text.replace(/<((https?|ftp|dict):[^'">\s]+)>/gi,"<a href=\"$1\">$1</a>");

	// Email addresses: <address@domain.foo>

	/*
		text = text.replace(/
			<
			(?:mailto:)?
			(
				[-.\w]+
				\@
				[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+
			)
			>
		/gi, _DoAutoLinks_callback());
	*/
	text = text.replace(/<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
		function(wholeMatch,m1) {
			return _EncodeEmailAddress( _UnescapeSpecialChars(m1) );
		}
	);

	return text;
}


var _EncodeEmailAddress = function(addr) {
//
//  Input: an email address, e.g. "foo@example.com"
//
//  Output: the email address as a mailto link, with each character
//	of the address encoded as either a decimal or hex entity, in
//	the hopes of foiling most address harvesting spam bots. E.g.:
//
//	<a href="&#x6D;&#97;&#105;&#108;&#x74;&#111;:&#102;&#111;&#111;&#64;&#101;
//	   x&#x61;&#109;&#x70;&#108;&#x65;&#x2E;&#99;&#111;&#109;">&#102;&#111;&#111;
//	   &#64;&#101;x&#x61;&#109;&#x70;&#108;&#x65;&#x2E;&#99;&#111;&#109;</a>
//
//  Based on a filter by Matthew Wickline, posted to the BBEdit-Talk
//  mailing list: <http://tinyurl.com/yu7ue>
//

	// attacklab: why can't javascript speak hex?
	function char2hex(ch) {
		var hexDigits = '0123456789ABCDEF';
		var dec = ch.charCodeAt(0);
		return(hexDigits.charAt(dec>>4) + hexDigits.charAt(dec&15));
	}

	var encode = [
		function(ch){return "&#"+ch.charCodeAt(0)+";";},
		function(ch){return "&#x"+char2hex(ch)+";";},
		function(ch){return ch;}
	];

	addr = "mailto:" + addr;

	addr = addr.replace(/./g, function(ch) {
		if (ch == "@") {
		   	// this *must* be encoded. I insist.
			ch = encode[Math.floor(Math.random()*2)](ch);
		} else if (ch !=":") {
			// leave ':' alone (to spot mailto: later)
			var r = Math.random();
			// roughly 10% raw, 45% hex, 45% dec
			ch =  (
					r > .9  ?	encode[2](ch)   :
					r > .45 ?	encode[1](ch)   :
								encode[0](ch)
				);
		}
		return ch;
	});

	addr = "<a href=\"" + addr + "\">" + addr + "</a>";
	addr = addr.replace(/">.+:/g,"\">"); // strip the mailto: from the visible part

	return addr;
}


var _UnescapeSpecialChars = function(text) {
//
// Swap back in all the special characters we've hidden.
//
	text = text.replace(/~E(\d+)E/g,
		function(wholeMatch,m1) {
			var charCodeToReplace = parseInt(m1);
			return String.fromCharCode(charCodeToReplace);
		}
	);
	return text;
}


var _Outdent = function(text) {
//
// Remove one level of line-leading tabs or spaces
//

	// attacklab: hack around Konqueror 3.5.4 bug:
	// "----------bug".replace(/^-/g,"") == "bug"

	text = text.replace(/^(\t|[ ]{1,4})/gm,"~0"); // attacklab: g_tab_width

	// attacklab: clean up hack
	text = text.replace(/~0/g,"")

	return text;
}

var _Detab = function(text) {
// attacklab: Detab's completely rewritten for speed.
// In perl we could fix it by anchoring the regexp with \G.
// In javascript we're less fortunate.

	// expand first n-1 tabs
	text = text.replace(/\t(?=\t)/g,"    "); // attacklab: g_tab_width

	// replace the nth with two sentinels
	text = text.replace(/\t/g,"~A~B");

	// use the sentinel to anchor our regex so it doesn't explode
	text = text.replace(/~B(.+?)~A/g,
		function(wholeMatch,m1,m2) {
			var leadingText = m1;
			var numSpaces = 4 - leadingText.length % 4;  // attacklab: g_tab_width

			// there *must* be a better way to do this:
			for (var i=0; i<numSpaces; i++) leadingText+=" ";

			return leadingText;
		}
	);

	// clean up sentinels
	text = text.replace(/~A/g,"    ");  // attacklab: g_tab_width
	text = text.replace(/~B/g,"");

	return text;
}


//
//  attacklab: Utility functions
//


var escapeCharacters = function(text, charsToEscape, afterBackslash) {
	// First we have to escape the escape characters so that
	// we can build a character class out of them
	var regexString = "([" + charsToEscape.replace(/([\[\]\\])/g,"\\$1") + "])";

	if (afterBackslash) {
		regexString = "\\\\" + regexString;
	}

	var regex = new RegExp(regexString,"g");
	text = text.replace(regex,escapeCharacters_callback);

	return text;
}


var escapeCharacters_callback = function(wholeMatch,m1) {
	var charCodeToEscape = m1.charCodeAt(0);
	return "~E"+charCodeToEscape+"E";
}

} // end of Attacklab.showdown.converter


// Version 0.9 used the Showdown namespace instead of Attacklab.showdown
// The old namespace is deprecated, but we'll support it for now:
var Showdown = Attacklab.showdown;

// If anyone's interested, tell the world that this file's been loaded
if (Attacklab.fileLoaded) {
	Attacklab.fileLoaded("showdown.js");
}
(function() {
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
				replacementText;
				
			numberBefore = (typeof numberBefore === "undefined" || numberBefore === null) ? 1 : numberBefore;
			numberAfter = (typeof numberAfter === "undefined" || numberAfter === null) ? 1 : numberAfter;

			numberBefore = numberBefore + 1;
			numberAfter = numberAfter + 1;

			this.selection = this.selection.replace(/(^\n*)/, "");
			this.startTag = this.startTag + RegExp.$1;
			this.selection = this.selection.replace(/(\n*$)/, "");
			this.endTag = this.endTag + RegExp.$1;
			this.startTag = this.startTag.replace(/(^\n*)/, "");
			this.before = this.before + RegExp.$1;
			this.endTag = this.endTag.replace(/(\n*$)/, "");
			this.after = this.after + RegExp.$1;

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
			insertion: '<span class="note">To add a tool-tip, place it in quotes after the URL (e.g., <strong>http://google.com "Google"</strong>)</span>'
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
window.WMD = WMD;
window.WMD.Command = Command;
window.WMD.Form = Form;
window.WMD.Field = Field;
})();

(function() {
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
				replacementText;
				
			numberBefore = (typeof numberBefore === "undefined" || numberBefore === null) ? 1 : numberBefore;
			numberAfter = (typeof numberAfter === "undefined" || numberAfter === null) ? 1 : numberAfter;

			numberBefore = numberBefore + 1;
			numberAfter = numberAfter + 1;

			this.selection = this.selection.replace(/(^\n*)/, "");
			this.startTag = this.startTag + RegExp.$1;
			this.selection = this.selection.replace(/(\n*$)/, "");
			this.endTag = this.endTag + RegExp.$1;
			this.startTag = this.startTag.replace(/(^\n*)/, "");
			this.before = this.before + RegExp.$1;
			this.endTag = this.endTag.replace(/(\n*$)/, "");
			this.after = this.after + RegExp.$1;

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
			insertion: '<span class="note">To add a tool-tip, place it in quotes after the URL (e.g., <strong>http://google.com "Google"</strong>)</span>'
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
window.WMD = WMD;
window.WMD.Command = Command;
window.WMD.Form = Form;
window.WMD.Field = Field;
})();

(function() {
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
				replacementText;
				
			numberBefore = (typeof numberBefore === "undefined" || numberBefore === null) ? 1 : numberBefore;
			numberAfter = (typeof numberAfter === "undefined" || numberAfter === null) ? 1 : numberAfter;

			numberBefore = numberBefore + 1;
			numberAfter = numberAfter + 1;

			this.selection = this.selection.replace(/(^\n*)/, "");
			this.startTag = this.startTag + RegExp.$1;
			this.selection = this.selection.replace(/(\n*$)/, "");
			this.endTag = this.endTag + RegExp.$1;
			this.startTag = this.startTag.replace(/(^\n*)/, "");
			this.before = this.before + RegExp.$1;
			this.endTag = this.endTag.replace(/(\n*$)/, "");
			this.after = this.after + RegExp.$1;

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
			insertion: '<span class="note">To add a tool-tip, place it in quotes after the URL (e.g., <strong>http://google.com "Google"</strong>)</span>'
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
window.WMD = WMD;
window.WMD.Command = Command;
window.WMD.Form = Form;
window.WMD.Field = Field;
})();
