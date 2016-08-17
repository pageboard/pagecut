BROWSERIFY = $(shell node -p 'require.resolve("browserify/bin/cmd.js")')
BUNDLEDOM = $(shell node -p 'require.resolve("bundledom/bin/bundledom.js")')
PROSEMIRROR = $(shell node -p 'require("path").resolve(require.resolve("prosemirror") + "/../..")')

all: dist/pm-editor.js src/component/*
	$(BUNDLEDOM) --concatenate src/index.html > dist/pm-editor.bundle.js

dist/pm-editor.js: src/editor/*.js $(PROSEMIRROR)/**/*.js
	$(BROWSERIFY) --standalone PmEditor --outfile $@ -t [ babelify --presets [ es2015 ] ] $<

