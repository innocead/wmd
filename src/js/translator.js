Translator_EN = {
    urlFieldInsertion: "<span class=\"note\">To add a tool-tip, place it in quotes after the URL (e.g., <strong>http://google.com \"Google\"</strong>)</span>",
    linkText: "link text",
    imageAlt: "image alt",
    listItem: "List item",
    
    strongTitle: "Strong <strong> Ctl+B",
    emTitle: "Emphasis <em> Ctl+I",
    aTitle: "Hyperlink <a> Ctl+L",
    blockquoteTitle: "Blockquote <blockquote> Ctl+Q",
    codeTitle: "Code Sample <pre><code> Ctl+K",
    imgTitle: "Image <img> Ctl+G",
    olTitle: "Numbered List <ol> Ctl+O",
    ulTitle: "Bulleted List <ul> Ctl+U",
    hTitle: "Heading <h1>/<h2> Ctl+H",
    hrTitle: "Horizontal Rule <hr> Ctl+R",
    
    strongText: "Bold",
    emText: "Italic",
    aText: "Link",
    blockquoteText: "Blockquote",
    codeText: "Code",
    imgText: "Image",
    olText: "Numbered List",
    ulText: "Bulleted List",
    hText: "Heading",
    hrText: "Horizontal Rule",   
    
    insertImage: "Insert image",
    imageURL: "Image URL",
    enterCodeHere: "enter code here",
    blockquote: "Blockquote",
    insertLink: "Insert link",
    linkURL: "Link URL",
    
    submit: "Submit",
    cancel: "Cancel"
};

Translator_FR = {
    urlFieldInsertion: "<span class=\"note\">Pour ajouter une infobulle, indiquez son contenu entre guillemets après l'URL (e.g., <strong>http://google.com \"Google\"</strong>)</span>",
    linkText: "Texte du lien",
    imageAlt: "Texte alternatif de l'image",
    listItem: "Elément de la liste",
    
    strongTitle: "Gras <strong> Ctl+B",
    emTitle: "Italique <em> Ctl+I",
    aTitle: "Lien externe <a> Ctl+L",
    blockquoteTitle: "Citation <blockquote> Ctl+Q",
    codeTitle: "Exemple de code <pre><code> Ctl+K",
    imgTitle: "Image <img> Ctl+G",
    olTitle: "Liste numérotée <ol> Ctl+O",
    ulTitle: "Liste à puces <ul> Ctl+U", 
    hTitle: "Titre <h1>/<h2> Ctl+H",
    hrTitle: "Séparateur horizontal <hr> Ctl+R",
    
    strongText: "Gras",
    emText: "Italique",
    aText: "Lien",
    blockquoteText: "Citation",
    codeText: "Code",
    imgText: "Image",
    olText: "Liste Numérotée",
    ulText: "Liste à Puces",
    hText: "Titre",
    hrText: "Séparateur",   
    
    insertImage: "Insérer une image",
    imageURL: "URL de l'image",
    enterCodeHere: "Saisir du code ici",
    blockquote: "Citation",
    insertLink: "Insérer un lien",
    linkURL: "URL du lien",
    
    submit: "Valider",
    cancel: "Annuler"
};

Translator_RU = {
    urlFieldInsertion: "<span class=\"note\">(например, <strong>http://google.com</strong>)</span>",
    linkText: "название ссылки",
    imageAlt: "описание картинки",
    listItem: "текст",
    
    strongTitle: "Жирный <strong> Ctl+B",
    emTitle: "Курсив <em> Ctl+I",
    aTitle: "Вставить ссылку <a> Ctl+L",
    blockquoteTitle: "Цитировать <blockquote> Ctl+Q",
    codeTitle: "Вставить пример кода <pre><code> Ctl+K",
    imgTitle: "Вставить картинку <img> Ctl+G",
    olTitle: "Нумерованный список <ol> Ctl+O",
    ulTitle: "Маркированный список <ul> Ctl+U",
    hTitle: "Вставить заголовок <h1>/<h2> Ctl+H",
    hrTitle: "Горизонтальная черта <hr> Ctl+R",
    
    strongText: "Bold",
    emText: "Italic",
    aText: "Link",
    blockquoteText: "Blockquote",
    codeText: "Code",
    imgText: "Image",
    olText: "Numbered List",
    ulText: "Bulleted List",
    hText: "Heading",
    hrText: "Horizontal Rule",   
    
    insertImage: "Вставить картинку",
    imageURL: "Адрес картинки",
    enterCodeHere: "вставьте код сдесь",
    blockquote: "текст цитаты",
    insertLink: "Вставить ссылку",
    linkURL: "Ссылка",
    
    submit: "Ок",
    cancel: "Отмена"
};

Translator = Translator_EN;

function chooseTranslator(lang)
{
    if(lang == "RU") {
        Translator = Translator_RU;
	} else if (lang == "FR") {
		Translator = Translator_FR;
	} else {
        Translator = Translator_EN;
	}
    
    //small hack
    Command.builtIn = {
	"strong": {text:Translator.strongText, title:Translator.strongTitle, css:"wmd-strong", shortcut:"b"},
	"em": {text:Translator.emText, title:Translator.emTitle, css:"wmd-em", shortcut:"i"},
	"a": {text:Translator.aText, title:Translator.aTitle, css:"wmd-a", shortcut:"l"},
	"blockquote": {text:Translator.blockquoteText, title:Translator.blockquoteTitle, css:"wmd-blockquote", shortcut:"q"},
	"code": {text:Translator.codeText, title:Translator.codeTitle, css:"wmd-code", shortcut:"k"},
	"img": {text:Translator.imgText, title:Translator.imgTitle, css:"wmd-img", shortcut:"g"},
	"ol": {text:Translator.olText, title:Translator.olTitle, css:"wmd-ol", shortcut:"o"},
	"ul": {text:Translator.ulText, title:Translator.ulTitle, css:"wmd-ul", shortcut:"u"},
	"h": {text:Translator.hText, title:Translator.hTitle, css:"wmd-h", shortcut:"h"},
	"hr": {text:Translator.hrText, title:Translator.hrTitle, css:"wmd-hr", shortcut:"r"},
	"spacer": {css:"wmd-spacer", builder:Command.createSpacer}
    };
};


