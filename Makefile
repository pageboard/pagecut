BROWSERIFY = $(shell node -p 'require.resolve("browserify/bin/cmd.js")') -t [ babelify --presets [ es2015 ] ]

FONT_DIR      ?= ./font
FONTELLO_HOST ?= http://fontello.com

.PHONY: build
build: predist dist/pagecut-menu.js dist/pagecut-editor.js dist/pagecut-viewer.js

.PHONY: all

all: clean build

clean:
	rm -rf dist/*

predist:
	mkdir -p dist/
	cp src/*.css dist/

dist/pagecut-editor.js: src/*.js
	#-patch --backup --forward --strip 0 --quiet --reject-file - < src/prosemirror.patch
	rm -rf node_modules/prosemirror-dropcursor && ln -s @kapouer/prosemirror-dropcursor node_modules/
	$(BROWSERIFY) --standalone Pagecut --outfile $@ src/editor.js

dist/pagecut-viewer.js: src/viewer.js
	$(BROWSERIFY) --standalone Pagecut.Viewer --outfile $@ src/viewer.js

dist/pagecut-menu.js: src/menubar.js
	$(BROWSERIFY) --standalone Pagecut.Menubar --outfile $@ src/menubar.js

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
