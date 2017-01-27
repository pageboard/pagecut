BROWSERIFY = $(shell node -p 'require.resolve("browserify/bin/cmd.js")')
BUNDLEDOM = $(shell node -p 'require.resolve("bundledom/bin/bundledom.js")')
FONT_DIR      ?= ./font
FONTELLO_HOST ?= http://fontello.com

.PHONY: build
build: predist dist/pagecut-editor.js dist/pagecut-viewer.js dist/inspector.js dist/id.js

.PHONY: all
all: clean build
	$(BUNDLEDOM) sample/index.html \
	--html index.html \
	--root dist/ \
	--js pagecut.min.js \
	--css pagecut.min.css \
	--ignore agent.js \
	--ignore diffDOM.js \
	--ignore .

clean:
	rm -f dist/*

predist:
	cp src/prosemirror*.css dist/
	cp modules/inspector/*.css dist/
	cp src/*.css dist/

dist/inspector.js: modules/inspector/index.js
	$(BROWSERIFY) --standalone Pagecut.modules.inspector --outfile $@ modules/inspector/index.js

dist/id.js: modules/id.js
	$(BROWSERIFY) --standalone Pagecut.modules.id --outfile $@ modules/id.js

dist/pagecut-editor.js: src/*.js
	$(BROWSERIFY) --standalone Pagecut.Editor --outfile $@ src/editor.js

dist/pagecut-viewer.js: src/viewer.js
	$(BROWSERIFY) --standalone Pagecut.Viewer --outfile $@ src/viewer.js

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
