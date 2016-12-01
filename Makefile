BROWSERIFY = $(shell node -p 'require.resolve("browserify/bin/cmd.js")')
BUNDLEDOM = $(shell node -p 'require.resolve("bundledom/bin/bundledom.js")')
FONT_DIR      ?= ./font
FONTELLO_HOST ?= http://fontello.com

.PHONY: build
build: dist/coed.js dist/coed-link.js

.PHONY: all
all: clean build predist

	$(BUNDLEDOM) sample/index.html --html index.html --root dist/ --js coed.min.js --css coed.min.css --ignore agent.js --ignore diffDOM.js --ignore .

clean:
	rm -f dist/*

predist:
	cp src/prosemirror*.css dist/

dist/coed-link.js: src/coed-link.js
	$(BROWSERIFY) --outfile $@ src/coed-link.js

dist/coed.js: src/*
	#-patch --backup --forward --strip 0 --quiet --reject-file - < src/prosemirror.patch
	$(BROWSERIFY) --standalone Coed --outfile $@ src/coed.js

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
