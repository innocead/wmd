#!/bin/bash
LIB_DIR="lib"
JS_SOURCE_DIR="src/js"
JS_SOURCE_FILES=( "wmd.js" "chunk.js" "inputstate.js" "command.js" "dialog.js" "form.js" "field.js" "linkhelper.js" )
JS_SOURCE_COUNT=${#JS_SOURCE_FILES[@]}
JS_TARGETS=( "build/wmd.js" "docs/wmd.js" )
JS_TARGET_COUNT=${#JS_TARGETS[@]}
CSS_SOURCE_DIR="src/css"
CSS_SOURCE_FILES=( "wmd.css" )
CSS_SOURCE_COUNT=${#CSS_SOURCE_FILES[@]}
CSS_TARGETS=( "build/wmd.css" "docs/wmd.css" )
CSS_TARGET_COUNT=${#CSS_TARGETS[@]}

echo Compressing to ${JS_TARGETS[0]}:
touch ${JS_TARGETS[0]}

if [ "$1" == "--showdown" ] || [ "$2" == "--showdown" ]
then
	echo $LIB_DIR/showdown.js
	
	if [ "$1" == "--nocompress" ] || [ "$2" == "--nocompress" ]
	then
		cat $LIB_DIR/showdown.js > ${JS_TARGETS[0]}
	else
		java -jar $LIB_DIR/yuicompressor-2.4.2.jar --nomunge --preserve-semi $LIB_DIR/showdown.js > ${JS_TARGETS[0]}
	fi
	
	echo >> ${JS_TARGETS[0]}
	
	echo "(function() {" >> ${JS_TARGETS[0]}
else
	echo "(function() {" > ${JS_TARGETS[0]}
fi

for (( i=0;i<$JS_SOURCE_COUNT;i++ )); do
	echo $JS_SOURCE_DIR/${JS_SOURCE_FILES[${i}]}
	
	if [ "$1" == "--nocompress" ] || [ "$2" == "--nocompress" ]
	then
		cat $JS_SOURCE_DIR/${JS_SOURCE_FILES[${i}]} >> ${JS_TARGETS[0]}
	else
		java -jar $LIB_DIR/yuicompressor-2.4.2.jar --nomunge --preserve-semi $JS_SOURCE_DIR/${JS_SOURCE_FILES[${i}]} >> ${JS_TARGETS[0]}
	fi
	
	echo >> ${JS_TARGETS[0]}
done

# Show off the public script APIs and then close the script.
echo "window.WMD = WMD;" >> ${JS_TARGETS[0]}
echo "window.WMD.Command = Command;" >> ${JS_TARGETS[0]}
echo "window.WMD.Form = Form;" >> ${JS_TARGETS[0]}
echo "window.WMD.Field = Field;" >> ${JS_TARGETS[0]}
echo "})();" >> ${JS_TARGETS[0]}

echo

for (( i=1;i<$JS_TARGET_COUNT;i++ )); do
	echo Copying to target ${JS_TARGETS[${i}]}
	cat ${JS_TARGETS[0]} > ${JS_TARGETS[${i}]}
done

echo
echo Compressing to ${CSS_TARGETS[0]}:
touch ${CSS_TARGETS[0]}
echo > ${CSS_TARGETS[0]}

for (( i=0;i<$CSS_SOURCE_COUNT;i++ )); do
	echo $CSS_SOURCE_DIR/${CSS_SOURCE_FILES[${i}]}

	if [ "$1" == "--nocompress" ] || [ "$2" == "--nocompress" ]
	then
		cat $CSS_SOURCE_DIR/${CSS_SOURCE_FILES[${i}]} >> ${CSS_TARGETS[0]}
	else
		java -jar $LIB_DIR/yuicompressor-2.4.2.jar "--type" css $CSS_SOURCE_DIR/${CSS_SOURCE_FILES[${i}]} >> ${CSS_TARGETS[0]}
	fi
	
	echo >> ${CSS_TARGETS[0]}
done

echo

for (( i=1;i<$CSS_TARGET_COUNT;i++ )); do
	echo Copying to CSS target ${CSS_TARGETS[${i}]}
	cat ${CSS_TARGETS[0]} > ${CSS_TARGETS[${i}]}
done

echo