BROWSERIFY = $(shell node -p 'require.resolve("browserify/bin/cmd.js")')
BUNDLEDOM = $(shell node -p 'require.resolve("bundledom/bin/bundledom.js")')
PROSEMIRROR = $(shell node -p 'require("path").resolve(require.resolve("prosemirror") + "/../..")')
FONT_DIR      ?= ./font
FONTELLO_HOST ?= http://fontello.com

all: dist/edbed.js src/*
	$(BUNDLEDOM) dist/index.html --js edbed.min.js --css edbed.min.css

dist/edbed.js: src/*.js $(PROSEMIRROR)/**/*.js
	$(BROWSERIFY) --standalone Edbed --outfile $@ -t [ babelify --presets [ es2015 ] ] src/edbed.js

fontopen:
	@if test ! `which curl` ; then \
		echo 'Install curl first.' >&2 ; \
		exit 128 ; \
		fi
	curl --silent --show-error --fail --output .fontello \
		--form "config=@${FONT_DIR}/config.json" \
		${FONTELLO_HOST}
	x-www-browser ${FONTELLO_HOST}/`cat .fontello`

fontsave:
	echo "Generated files must be updated manually"
	@if test ! `which unzip` ; then \
		echo 'Install unzip first.' >&2 ; \
		exit 128 ; \
		fi
	@if test ! -e .fontello ; then \
		echo 'Run `make fontopen` first.' >&2 ; \
		exit 128 ; \
		fi
	rm -rf .fontello.src .fontello.zip
	curl --silent --show-error --fail --output .fontello.zip \
		${FONTELLO_HOST}/`cat .fontello`/get
	unzip .fontello.zip -d .fontello.src
	rm -rf ${FONT_DIR}
	mv `find ./.fontello.src -maxdepth 1 -name 'fontello-*'` ${FONT_DIR}
	rm -rf .fontello.src .fontello.zip

