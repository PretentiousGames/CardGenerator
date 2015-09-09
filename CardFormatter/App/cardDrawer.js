//The cardformatter namespace
(function () {
    var cardFormatter = window.cardFormatter || {};
    window.cardFormatter = cardFormatter;
    var template = {};

    //The cardDrawer member of the namespace
    (function () {
        var debug = false;

        //Discovers the elements in a template that are applicable to the card in question.
        var findElements = function (localTemptlate, card) {
            var getValue = function (val) {
                if (!val) {
                    return undefined;
                }
                if (val.constant) {
                    return template.constants[val.constant];
                }
                return val;
            };
            var isApplicable = function (t) {
                var checkSingleRequirement = function (requirement) {
                    var exists = requirement.exists !== false;
                    var includes = _.map(requirement.values, function (value) { return getValue(value); });
                    var excludes = _.map(requirement.excludes, function (value) { return getValue(value); });
                    return ((exists === true && (!!card[requirement.name]))
                            || (exists === false && (!card[requirement.name])))
                        || (includes.length > 0
                            && _.contains(includes, getValue(card[requirement.name])))
                        || (excludes.length > 0
                            && !_.contains(excludes, getValue(card[requirement.name])));
                };

                return _.every(t.requirements, function (requirement) {
                    if (_.isArray(requirement)) {
                        return _.any(requirement, checkSingleRequirement);
                    } else {
                        return checkSingleRequirement(requirement);
                    }
                });
            };

            var results = [];
            if (isApplicable(localTemptlate)) {
                results = results.concat(localTemptlate.elements);
                _.each(localTemptlate.subTypes, function (subType) { results = results.concat(findElements(subType, card)); });
            }
            return results;
        };

        //Draws a list of elements on the card
        var drawElements = function (card, elements, imageFiles, context, fonts, callback) {
            var images = {};

            //load images
            _.each(elements, function (element) {
                if (element.type === 'image') {
                    var imageNode = card[element.name];
                    if (imageNode || element.constant) {
                        var constant = element.constant || imageNode.constant;
                        var imageName = (constant ? template.constants[constant] : imageNode.name || imageNode).toLocaleLowerCase();
                        var imageObj = _.where(imageFiles, { name: imageName })[0];
                        if (imageObj) {
                            images[element.name] = imageObj.image;
                        }
                    }
                }
            });

            //set offsets
            _.chain(elements)
             .filter(function (e) { return e.type === "array" })
             .each(function (e) {
                 e.count = 0;
             });

            //scale image
            var scale = card.orientation === 'vertical' ?
                Math.min(card.canvas.height / template.fullHeight, card.canvas.width / template.fullWidth) :
                Math.min(card.canvas.width / template.fullHeight, card.canvas.height / template.fullWidth);
            context.scale(scale, scale);

            //helper methods
            var drawText = function (obj) {
                if (debug) {
                    context.rect(obj.styles.x, obj.styles.y, obj.styles.xSize, obj.styles.ySize);
                    context.stroke();
                }
                obj.card = card;
                cardFormatter.textDrawer.drawText(card.canvas, context, fonts, obj);
            };
            var drawErrorText = function (text) {
                cardFormatter.textDrawer.drawText(card.canvas, context, fonts, [{ text: text }], 0, 0, template.fullWidth, template.fullHeight);
            };
            var drawImage = function (element) {
                var image = images[element.name];
                if (!image) {
                    var img = card[element.name];
                    if (img) {
                        drawErrorText('image was not found: ' + (img.name || img.constant));
                    }
                } else {
                    context.drawImage(image, element.x, element.y);
                }
            };
            var applyArray = function (element) {
                if (element.styles.array) {
                    _.chain(elements)
                     .filter(function (e) { return e.name === element.styles.array })
                     .each(function (e) {
                         element.styles = _.extend({}, e.styles, element.styles);
                         element.styles.x = e.styles.x + (e.styles.orientation === "horizontal" ? (e.count * e.styles.itemWidth) : 0);
                         element.styles.y = e.styles.y + (e.styles.orientation === "vertical" ? (e.count * e.styles.itemHeight) : 0);
                         element.styles.xSize = e.styles.orientation === "horizontal" ? e.styles.itemWidth : e.styles.xSize;
                         element.styles.ySize = e.styles.orientation === "vertical" ? e.styles.itemHeight : e.styles.ySize;
                         e.count++;
                     });
                }
                return element;
            };

            //loop through all elements, drawing them all
            _.chain(elements)
                .filter(function (element) { return element.draw !== false; })
                .each(function (element) {
                    if (element.type === 'image') {
                        drawImage(element);
                    } else if (element.type === 'style') {
                        _.each(element.values, function (value, key) {
                            context[key] = value;
                        });
                    } else if (element.type === 'text') {
                        drawText(applyArray(element));
                    }
                });

            callback(card);
        };

        var massageTemplate = function (currentTemplate, styles) {
            var templateMergedStyles = _.extend({}, styles, currentTemplate.styles);
            _.each(currentTemplate.subTypes, function (subtype) {
                massageTemplate(subtype, templateMergedStyles);
            });
            _.each(currentTemplate.elements, function (element) {
                element.getMergedStyles = function () { return _.extend({}, templateMergedStyles, element.styles); };
            });
        };

        var drawCard = function (cardTemplate, card, imageFiles, fonts, callback) {
            var context = card.canvas.getContext('2d');

            //Load up the fonts
            _.each(fonts, function (font) {
                var styleObj = { fontSize: 100 };
                cardFormatter.drawer.fillText(context, font.font, ' ', 0, 0, styleObj);
            });

            //Add the merged style method to all the elements
            template = cardTemplate;
            massageTemplate(template, {});

            //Find the things that should be displayed
            var elements = findElements(template, card);

            //Draw them
            drawElements(card, elements, imageFiles, context, fonts, callback);
        }

        cardFormatter.cardDrawer = {
            drawCard: drawCard
        }
    })();

    //The textDrawer member of the namespace
    (function () {
        var getRuns = function (obj) {
            var addFixes = function (val) {
                var prefix;
                var suffix;
                if (obj.prefix) {
                    prefix = obj.prefix.constant ? template.constants[obj.prefix.constant] :
                      obj.prefix.text ? obj.prefix.text : obj.prefix;
                }
                if (obj.suffix) {
                    suffix = obj.suffix.constant ? template.constants[obj.suffix.constant] :
                      obj.suffix.text ? obj.suffix.text : obj.suffix;
                }
                if (prefix) {
                    val.unshift({ text: prefix, styles: obj.styles });
                }
                if (suffix) {
                    val.push({ text: suffix, styles: obj.styles });
                }
                return val;
            };
            var findText = function (val) {
                var copyBaseStyles = function (val) {
                    val.styles = _.extend({}, obj.styles, val.styles);
                    return val;
                };

                if (val.text) {
                    return [{ text: val.text, styles: val.styles }];
                } else if (val.constant) {
                    return _.map(getRuns(template.constants[val.constant]), copyBaseStyles);
                } else if (val.name && val.card[val.name]) {
                    return _.map(getRuns(val.card[val.name]), copyBaseStyles);
                } else if (_.isArray(val)) {
                    return _.flatten(_.map(val, getRuns));
                } else if (_.isString(val)) {
                    return [{ text: val }];
                }
                return [];
            };
            return addFixes(findText(obj));
        };
        var reduceRuns = function (memo, item) {
            var lines = item.text.split('\n');
            _.each(lines, function (l, i, ls) {
                var words = l.split(' ');
                _.each(words, function (w, j, ws) {
                    if (w !== '') {
                        memo.push({ text: w, styles: item.styles });
                    }
                    if (j + 1 < ws.length) {
                        memo.push({ text: ' ', styles: item.styles });
                    }
                });
                if (i + 1 < ls.length) {
                    memo.push({ text: '\n', styles: item.styles });
                }
            });
            return memo;
        };

        var drawText = function (canvas, context, fonts, obj) {
            var styles = obj.getMergedStyles();
            var justification = styles.justification || 'left';
            var alignment = styles.alignment || 'top';
            var maxFontSize = styles.maxFontSize || 100.0;
            var minFontSize = styles.minFontSize || 15.0;
            var font = styles.font || 'Arial';
            var lineHeight = styles.lineHeight || 1.0;
            var offset = styles.offset || 0.0;
            var noWrap = styles.noWrap || false;
            var shadowStrength = styles.shadowStrength || 1;
            var rotate = styles.rotate || 0;
            var lastLineHeight = styles.lastLineHeight || lineHeight;
            var x = styles.x;
            var y = styles.y;
            var xSize = styles.xSize;
            var ySize = styles.ySize;

            var fontObj = _.where(fonts, { name: font.toLocaleLowerCase() })[0].font;

            var runs = getRuns(obj);
            var items = _.reduce(runs, reduceRuns, []);
            var oldFont = context.font;
            var fontSize = maxFontSize;

            var oldStyles = {};
            var setStyles = function (styles) {
                oldStyles = {};
                oldStyles.font = context.font;
                _.each(styles, function (style, name) {
                    if (!oldStyles[name]) {
                        oldStyles[name] = context[name];
                    }
                    context[name] = style;
                });
                if (!context.fillStyle) {
                    context.fillStyle = '#000';
                }
            };
            var resetStyles = function () {
                _.each(oldStyles, function (style, name) {
                    context[name] = style;
                });
            };

            var shrinkDownThisJank = function () {
                var line;
                var lines;
                do {
                    line = {
                        words: []
                    };
                    lines = [];
                    var cy = lastLineHeight * fontSize;

                    var currentLineWords = 0;
                    var currentLineWidth = 0;
                    var beginNewLine = function (nextLine) {
                        var lastWord = line.words[line.words.length - 1];
                        while (lastWord.text === ' ') {
                            line.words.pop();
                            currentLineWidth -= lastWord.width;
                            lastWord = line.words[line.words.length - 1];
                        }

                        line.length = currentLineWidth;
                        lines.push(line);
                        cy += lineHeight * fontSize;
                        currentLineWords = 0;
                        currentLineWidth = 0;
                        line = nextLine;
                    };

                    for (var n = 0; n < items.length; n++) {
                        if (items[n].text === '\n') {
                            if (line.words) {
                                beginNewLine({ words: [] });
                            }
                            continue;
                        }
                        if (cy > ySize) {
                            break;
                        }
                        var testWord = items[n];
                        currentLineWords++;
                        setStyles(testWord.styles);

                        var measure = cardFormatter.drawer.measureText(fontObj, fontSize * (testWord.relativeFontSize || 1), testWord.text);
                        var testWordWidth = measure.width + (fontSize * .1);
                        testWord.width = testWordWidth;
                        testWord.xLeadIn = measure.xLeadIn;

                        resetStyles();
                        var testLineWidth = currentLineWidth + testWordWidth;
                        if (testWordWidth > xSize || (testLineWidth > xSize && (currentLineWords === 1 || noWrap))) {
                            //We are too wide, need to shrink the font.
                            cy = ySize + 1;
                            break;
                        } else if (testLineWidth > xSize && n > 0) {
                            if (testWord.text === ' ') {
                                beginNewLine({ words: [] });
                            } else {
                                beginNewLine({ words: [testWord] });
                                currentLineWidth = testWordWidth;
                            }
                        } else {
                            line.words.push(testWord);
                            currentLineWidth = testLineWidth;
                        }
                    }
                    if (cy > ySize) {
                        fontSize--;
                        if (fontSize < minFontSize) {
                            fontSize++;
                            break;
                        }
                    }
                } while (cy > ySize)
                line.length = currentLineWidth;
                lines.push(line);

                return lines;
            };
            var lines = shrinkDownThisJank();

            var countSpaces = function (l) {
                return _.countBy(l.words, function (word) {
                    return word.text === ' ' ? 'space' : 'other';
                });
            };

            var getWordX = function (sizeOffset) {
                return justification === 'right' ? x + sizeOffset : justification === 'center' ? x + (sizeOffset / 2) : x;
            };

            var getYPositioning = function (w, cy) {
                return cy + (fontSize * (1 - (w.relativeFontSize || 1)));
            };

            var drawShadowLines = function (ls) {
                var drawLine = function (l) {
                    var spacesCount = countSpaces(l);
                    var sizeOffset = xSize - l.length;
                    var extraXOffset = sizeOffset / spacesCount.space;
                    var wx = getWordX(sizeOffset);
                    l.words.forEach(function (w) {
                        setStyles(w.styles);
                        wx += w.text === ' ' && justification === 'full' ? extraXOffset : 0;
                        for (var ssi = 0; ssi < shadowStrength; ssi++) {
                            var styleObj = { fontSize: fontSize * (w.relativeFontSize || 1), fillStyle: w.styles.fillStyle };
                            cardFormatter.drawer.fillText(context, fontObj, w.text, wx - w.xLeadIn, getYPositioning(w, wy), styleObj);
                        }
                        var wordWidth = w.width;
                        //context.strokeRect(wx, wy + (fontSize / 3), wordWidth, lineHeight * fontSize);
                        wx += wordWidth;
                        resetStyles();
                    });
                    wy += lineHeight * fontSize;
                };

                ls.forEach(drawLine);
            };

            var drawRealLines = function (ls) {
                ls.forEach(function (l) {
                    var spacesCount = countSpaces(l);
                    var sizeOffset = xSize - l.length;
                    var extraXOffset = sizeOffset / spacesCount.space;
                    var wx = getWordX(sizeOffset);
                    l.words.forEach(function (w) {
                        setStyles(w.styles);
                        context.shadowColor = undefined;
                        wx += w.text === ' ' && justification === 'full' ? extraXOffset : 0;
                        var styleObj = { fontSize: fontSize * (w.relativeFontSize || 1), fillStyle: w.styles.fillStyle };
                        cardFormatter.drawer.fillText(context, fontObj, w.text, wx - w.xLeadIn, getYPositioning(w, wy), styleObj);
                        if (w.innerShadow) {
                            var obj = w.innerShadow.styles;
                            obj.fontSize = fontSize * (w.relativeFontSize || 1);
                            obj.font = font;
                            cardFormatter.drawer.drawInnerShadow(context, fontObj, w.text, wx - w.xLeadIn, getYPositioning(w, wy), obj);
                        }

                        wx += w.width;
                        resetStyles();
                    });
                    wy += lineHeight * fontSize;
                });
            };

            context.save();
            if (rotate) {
                context.translate(x + (xSize / 2), y + (ySize / 2));
                context.rotate(rotate * Math.PI / 180);
                x = -(xSize / 2);
                y = -(ySize / 2);
            }

            y += offset * fontSize;

            var yStart = alignment === 'bottom' ? y + ySize - (lineHeight * fontSize * lines.length) + ((lastLineHeight - lineHeight) * fontSize) :
                alignment === 'middle' ? y + (ySize - (lineHeight * fontSize * lines.length) + ((lastLineHeight - lineHeight) * fontSize)) / 2 :
                /*alignment === 'top' ? */ y;

            var wy = yStart;
            drawShadowLines(lines);
            wy = yStart;
            drawRealLines(lines);

            context.restore();

            context.font = oldFont;
        };

        cardFormatter.textDrawer = {
            drawText: drawText
        };
    })();

    //The drawer member of the namespace
    (function () {
        var measureText = function (font, fontSize, text) {
            if (font) {
                if (text === ' ') {
                    return { width: fontSize * .2, height: fontSize };
                }
                var path = font.getPath(text, 0, 0, fontSize, { kerning: false });
                var svgPath = path.toPathData();
                var canvasPath = new cardFormatter.canvgPath(svgPath);
                var bounds = canvasPath.bounds();
                return { width: bounds.pointWidth(), height: bounds.pointHeight(), xLeadIn: bounds.px1 };
            }
            return { width: 0, height: 0 };
        };

        var fillText = function (ctx, font, text, x, y, obj) {
            if (!font) {
                return;
            }
            var topOffset = obj.fontSize;//font.ascender / font.unitsPerEm * obj.fontSize;

            var path = font.getPath(text, x, y + topOffset, obj.fontSize, { kerning: false });
            var svgPath = path.toPathData();
            var canvasPath = new cardFormatter.canvgPath(svgPath);
            ctx.fillStyle = obj.fillStyle;
            canvasPath.draw(ctx);
            ctx.fill();
        };

        var drawInnerShadow = function (ctx, font, text, x, y, obj) {
            if (!font) {
                return;
            }
            var topOffset = obj.fontSize;//font.ascender / font.unitsPerEm * obj.fontSize;

            var path = font.getPath(text, x, y + topOffset, obj.fontSize, { kerning: false });
            var svgPath = path.toPathData();
            var canvasPath = new cardFormatter.canvgPath(svgPath);

            ctx.save();
            ctx.fillStyle = obj.fillStyle;
            canvasPath.draw(ctx);

            ctx.lineWidth = obj.initialLineWidth;
            ctx.strokeStyle = obj.strokeStyle;
            ctx.stroke();

            ctx.shadowColor = obj.outerShadowColor;
            ctx.shadowBlur = obj.outerShadowBlur;
            for (var j = 0; j < obj.outerShadowStrength; j++) {
                ctx.stroke();
            }

            ctx.clip();

            ctx.shadowColor = obj.shadowColor;
            ctx.lineWidth = obj.secondLineWidth;
            ctx.fill();
            for (var i = 0; i < 17; i += 2) {
                ctx.shadowBlur = i;
                ctx.stroke();
            }
            ctx.restore();
        };

        cardFormatter.drawer = {
            measureText: measureText,
            fillText: fillText,
            drawInnerShadow: drawInnerShadow,
        };
    })();

    //The canvgpath member of the namespace
    (function () {
        var canvgPathFunction = function () {
            var canvablePath = {};
            var fn = function (d) {
                // TODO: convert to real lexer based on http://www.w3.org/TR/SVG11/paths.html#PathDataBNF
                d = d.replace(/,/gm, ' '); // get rid of all commas
                d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([MmZzLlHhVvCcSsQqTtAa])/gm, '$1 $2'); // separate commands from commands
                d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([MmZzLlHhVvCcSsQqTtAa])/gm, '$1 $2'); // separate commands from commands
                d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([^\s])/gm, '$1 $2'); // separate commands from points
                d = d.replace(/([^\s])([MmZzLlHhVvCcSsQqTtAa])/gm, '$1 $2'); // separate commands from points
                d = d.replace(/([0-9])([+\-])/gm, '$1 $2'); // separate digits when no comma
                d = d.replace(/(\.[0-9]*)(\.)/gm, '$1 $2'); // separate digits when no comma
                d = d.replace(/([Aa](\s+[0-9]+){3})\s+([01])\s*([01])/gm, '$1 $3 $4 '); // shorthand elliptical arc path syntax
                d = canvablePath.compressSpaces(d); // compress multiple spaces
                d = canvablePath.trim(d);
                this.PathParser = new (function (d) {
                    this.tokens = d.split(' ');

                    this.reset = function () {
                        this.i = -1;
                        this.command = '';
                        this.previousCommand = '';
                        this.start = new canvablePath.Point(0, 0);
                        this.control = new canvablePath.Point(0, 0);
                        this.current = new canvablePath.Point(0, 0);
                        this.points = [];
                        this.angles = [];
                    }

                    this.isEnd = function () {
                        return this.i >= this.tokens.length - 1;
                    }

                    this.isCommandOrEnd = function () {
                        if (this.isEnd()) return true;
                        return this.tokens[this.i + 1].match(/^[A-Za-z]$/) != null;
                    }

                    this.isRelativeCommand = function () {
                        switch (this.command) {
                            case 'm':
                            case 'l':
                            case 'h':
                            case 'v':
                            case 'c':
                            case 's':
                            case 'q':
                            case 't':
                            case 'a':
                            case 'z':
                                return true;
                                break;
                        }
                        return false;
                    }

                    this.getToken = function () {
                        this.i++;
                        return this.tokens[this.i];
                    }

                    this.getScalar = function () {
                        return parseFloat(this.getToken());
                    }

                    this.nextCommand = function () {
                        this.previousCommand = this.command;
                        this.command = this.getToken();
                    }

                    this.getPoint = function () {
                        var p = new canvablePath.Point(this.getScalar(), this.getScalar());
                        return this.makeAbsolute(p);
                    }

                    this.getAsControlPoint = function () {
                        var p = this.getPoint();
                        this.control = p;
                        return p;
                    }

                    this.getAsCurrentPoint = function () {
                        var p = this.getPoint();
                        this.current = p;
                        return p;
                    }

                    this.getReflectedControlPoint = function () {
                        if (this.previousCommand.toLowerCase() != 'c' &&
                            this.previousCommand.toLowerCase() != 's' &&
                            this.previousCommand.toLowerCase() != 'q' &&
                            this.previousCommand.toLowerCase() != 't') {
                            return this.current;
                        }

                        // reflect point
                        var p = new canvablePath.Point(2 * this.current.x - this.control.x, 2 * this.current.y - this.control.y);
                        return p;
                    }

                    this.makeAbsolute = function (p) {
                        if (this.isRelativeCommand()) {
                            p.x += this.current.x;
                            p.y += this.current.y;
                        }
                        return p;
                    }

                    this.addMarker = function (p, from, priorTo) {
                        // if the last angle isn't filled in because we didn't have this point yet ...
                        if (priorTo != null && this.angles.length > 0 && this.angles[this.angles.length - 1] == null) {
                            this.angles[this.angles.length - 1] = this.points[this.points.length - 1].angleTo(priorTo);
                        }
                        this.addMarkerAngle(p, from == null ? null : from.angleTo(p));
                    }

                    this.addMarkerAngle = function (p, a) {
                        this.points.push(p);
                        this.angles.push(a);
                    }

                    this.getMarkerPoints = function () { return this.points; }
                    this.getMarkerAngles = function () {
                        for (var i = 0; i < this.angles.length; i++) {
                            if (this.angles[i] == null) {
                                for (var j = i + 1; j < this.angles.length; j++) {
                                    if (this.angles[j] != null) {
                                        this.angles[i] = this.angles[j];
                                        break;
                                    }
                                }
                            }
                        }
                        return this.angles;
                    }
                })(d);

                this.bounds = function () { return this.draw(null) }

                this.draw = function (ctx) {
                    var pp = this.PathParser;
                    pp.reset();

                    var bb = new canvablePath.BoundingBox();
                    if (ctx != null) ctx.beginPath();
                    while (!pp.isEnd()) {
                        pp.nextCommand();
                        switch (pp.command) {
                            case 'M':
                            case 'm':
                                var p = pp.getAsCurrentPoint();
                                pp.addMarker(p);
                                bb.addPoint(p.x, p.y);
                                if (ctx != null) ctx.moveTo(p.x, p.y);
                                pp.start = pp.current;
                                while (!pp.isCommandOrEnd()) {
                                    var p = pp.getAsCurrentPoint();
                                    pp.addMarker(p, pp.start);
                                    bb.addPoint(p.x, p.y);
                                    if (ctx != null) ctx.lineTo(p.x, p.y);
                                }
                                break;
                            case 'L':
                            case 'l':
                                while (!pp.isCommandOrEnd()) {
                                    var c = pp.current;
                                    var p = pp.getAsCurrentPoint();
                                    pp.addMarker(p, c);
                                    bb.addPoint(p.x, p.y);
                                    if (ctx != null) ctx.lineTo(p.x, p.y);
                                }
                                break;
                            case 'H':
                            case 'h':
                                while (!pp.isCommandOrEnd()) {
                                    var newP = new canvablePath.Point((pp.isRelativeCommand() ? pp.current.x : 0) + pp.getScalar(), pp.current.y);
                                    pp.addMarker(newP, pp.current);
                                    pp.current = newP;
                                    bb.addPoint(pp.current.x, pp.current.y);
                                    if (ctx != null) ctx.lineTo(pp.current.x, pp.current.y);
                                }
                                break;
                            case 'V':
                            case 'v':
                                while (!pp.isCommandOrEnd()) {
                                    var newP = new canvablePath.Point(pp.current.x, (pp.isRelativeCommand() ? pp.current.y : 0) + pp.getScalar());
                                    pp.addMarker(newP, pp.current);
                                    pp.current = newP;
                                    bb.addPoint(pp.current.x, pp.current.y);
                                    if (ctx != null) ctx.lineTo(pp.current.x, pp.current.y);
                                }
                                break;
                            case 'C':
                            case 'c':
                                while (!pp.isCommandOrEnd()) {
                                    var curr = pp.current;
                                    var p1 = pp.getPoint();
                                    var cntrl = pp.getAsControlPoint();
                                    var cp = pp.getAsCurrentPoint();
                                    pp.addMarker(cp, cntrl, p1);
                                    bb.addBezierCurve(curr.x, curr.y, p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                    if (ctx != null) ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                }
                                break;
                            case 'S':
                            case 's':
                                while (!pp.isCommandOrEnd()) {
                                    var curr = pp.current;
                                    var p1 = pp.getReflectedControlPoint();
                                    var cntrl = pp.getAsControlPoint();
                                    var cp = pp.getAsCurrentPoint();
                                    pp.addMarker(cp, cntrl, p1);
                                    bb.addBezierCurve(curr.x, curr.y, p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                    if (ctx != null) ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                }
                                break;
                            case 'Q':
                            case 'q':
                                while (!pp.isCommandOrEnd()) {
                                    var curr = pp.current;
                                    var cntrl = pp.getAsControlPoint();
                                    var cp = pp.getAsCurrentPoint();
                                    pp.addMarker(cp, cntrl, cntrl);
                                    bb.addQuadraticCurve(curr.x, curr.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                    if (ctx != null) ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
                                }
                                break;
                            case 'T':
                            case 't':
                                while (!pp.isCommandOrEnd()) {
                                    var curr = pp.current;
                                    var cntrl = pp.getReflectedControlPoint();
                                    pp.control = cntrl;
                                    var cp = pp.getAsCurrentPoint();
                                    pp.addMarker(cp, cntrl, cntrl);
                                    bb.addQuadraticCurve(curr.x, curr.y, cntrl.x, cntrl.y, cp.x, cp.y);
                                    if (ctx != null) ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
                                }
                                break;
                            case 'A':
                            case 'a':
                                while (!pp.isCommandOrEnd()) {
                                    var curr = pp.current;
                                    var rx = pp.getScalar();
                                    var ry = pp.getScalar();
                                    var xAxisRotation = pp.getScalar() * (Math.PI / 180.0);
                                    var largeArcFlag = pp.getScalar();
                                    var sweepFlag = pp.getScalar();
                                    var cp = pp.getAsCurrentPoint();

                                    // Conversion from endpoint to center parameterization
                                    // http://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
                                    // x1', y1'
                                    var currp = new canvablePath.Point(
                                        Math.cos(xAxisRotation) * (curr.x - cp.x) / 2.0 + Math.sin(xAxisRotation) * (curr.y - cp.y) / 2.0,
                                        -Math.sin(xAxisRotation) * (curr.x - cp.x) / 2.0 + Math.cos(xAxisRotation) * (curr.y - cp.y) / 2.0
                                    );
                                    // adjust radii
                                    var l = Math.pow(currp.x, 2) / Math.pow(rx, 2) + Math.pow(currp.y, 2) / Math.pow(ry, 2);
                                    if (l > 1) {
                                        rx *= Math.sqrt(l);
                                        ry *= Math.sqrt(l);
                                    }
                                    // cx', cy'
                                    var s = (largeArcFlag == sweepFlag ? -1 : 1) * Math.sqrt(
                                        ((Math.pow(rx, 2) * Math.pow(ry, 2)) - (Math.pow(rx, 2) * Math.pow(currp.y, 2)) - (Math.pow(ry, 2) * Math.pow(currp.x, 2))) /
                                        (Math.pow(rx, 2) * Math.pow(currp.y, 2) + Math.pow(ry, 2) * Math.pow(currp.x, 2))
                                    );
                                    if (isNaN(s)) s = 0;
                                    var cpp = new canvablePath.Point(s * rx * currp.y / ry, s * -ry * currp.x / rx);
                                    // cx, cy
                                    var centp = new canvablePath.Point(
                                        (curr.x + cp.x) / 2.0 + Math.cos(xAxisRotation) * cpp.x - Math.sin(xAxisRotation) * cpp.y,
                                        (curr.y + cp.y) / 2.0 + Math.sin(xAxisRotation) * cpp.x + Math.cos(xAxisRotation) * cpp.y
                                    );
                                    // vector magnitude
                                    var m = function (v) { return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2)); }
                                    // ratio between two vectors
                                    var r = function (u, v) { return (u[0] * v[0] + u[1] * v[1]) / (m(u) * m(v)) }
                                    // angle between two vectors
                                    var a = function (u, v) { return (u[0] * v[1] < u[1] * v[0] ? -1 : 1) * Math.acos(r(u, v)); }
                                    // initial angle
                                    var a1 = a([1, 0], [(currp.x - cpp.x) / rx, (currp.y - cpp.y) / ry]);
                                    // angle delta
                                    var u = [(currp.x - cpp.x) / rx, (currp.y - cpp.y) / ry];
                                    var v = [(-currp.x - cpp.x) / rx, (-currp.y - cpp.y) / ry];
                                    var ad = a(u, v);
                                    if (r(u, v) <= -1) ad = Math.PI;
                                    if (r(u, v) >= 1) ad = 0;

                                    // for markers
                                    var dir = 1 - sweepFlag ? 1.0 : -1.0;
                                    var ah = a1 + dir * (ad / 2.0);
                                    var halfWay = new canvablePath.Point(
                                        centp.x + rx * Math.cos(ah),
                                        centp.y + ry * Math.sin(ah)
                                    );
                                    pp.addMarkerAngle(halfWay, ah - dir * Math.PI / 2);
                                    pp.addMarkerAngle(cp, ah - dir * Math.PI);

                                    bb.addPoint(cp.x, cp.y); // TODO: this is too naive, make it better
                                    if (ctx != null) {
                                        var r = rx > ry ? rx : ry;
                                        var sx = rx > ry ? 1 : rx / ry;
                                        var sy = rx > ry ? ry / rx : 1;

                                        ctx.translate(centp.x, centp.y);
                                        ctx.rotate(xAxisRotation);
                                        ctx.scale(sx, sy);
                                        ctx.arc(0, 0, r, a1, a1 + ad, 1 - sweepFlag);
                                        ctx.scale(1 / sx, 1 / sy);
                                        ctx.rotate(-xAxisRotation);
                                        ctx.translate(-centp.x, -centp.y);
                                    }
                                }
                                break;
                            case 'Z':
                            case 'z':
                                if (ctx != null) ctx.closePath();
                                pp.current = pp.start;
                        }
                    }

                    return bb;
                }

                this.getMarkers = function () {
                    var points = this.PathParser.getMarkerPoints();
                    var angles = this.PathParser.getMarkerAngles();

                    var markers = [];
                    for (var i = 0; i < points.length; i++) {
                        markers.push([points[i], angles[i]]);
                    }
                    return markers;
                }
            }

            canvablePath.trim = function (s) { return s.replace(/^\s+|\s+$/g, ''); }

            canvablePath.compressSpaces = function (s) { return s.replace(/[\s\r\t\n]+/gm, ' '); }

            canvablePath.Point = function (x, y) {
                this.x = x;
                this.y = y;
            }
            canvablePath.Point.prototype.angleTo = function (p) {
                return Math.atan2(p.y - this.y, p.x - this.x);
            }
            canvablePath.Point.prototype.applyTransform = function (v) {
                var xp = this.x * v[0] + this.y * v[2] + v[4];
                var yp = this.x * v[1] + this.y * v[3] + v[5];
                this.x = xp;
                this.y = yp;
            }

            canvablePath.BoundingBox = function (x1, y1, x2, y2) { // pass in initial points if you want
                this.x1 = Number.NaN;
                this.y1 = Number.NaN;
                this.x2 = Number.NaN;
                this.y2 = Number.NaN;

                this.px1 = Number.NaN;
                this.py1 = Number.NaN;
                this.px2 = Number.NaN;
                this.py2 = Number.NaN;

                this.x = function () { return this.x1; }
                this.y = function () { return this.y1; }
                this.width = function () { return this.x2 - this.x1; }
                this.height = function () { return this.y2 - this.y1; }
                this.pointWidth = function () { return this.px2 - this.px1; }
                this.pointHeight = function () { return this.py2 - this.py1; }

                this.addPoint = function (x, y) {
                    if (x != null) {
                        if (isNaN(this.x1) || isNaN(this.x2)) {
                            this.x1 = x;
                            this.x2 = x;
                        }
                        if (x < this.x1) this.x1 = x;
                        if (x > this.x2) this.x2 = x;
                    }

                    if (y != null) {
                        if (isNaN(this.y1) || isNaN(this.y2)) {
                            this.y1 = y;
                            this.y2 = y;
                        }
                        if (y < this.y1) this.y1 = y;
                        if (y > this.y2) this.y2 = y;
                    }

                    if (y != null && x != null) {
                        if (isNaN(this.px1) || isNaN(this.px2)) {
                            this.px1 = x;
                            this.px2 = x;
                        }
                        if (x < this.px1) this.px1 = x;
                        if (x > this.px2) this.px2 = x;

                        if (isNaN(this.py2) || isNaN(this.py2)) {
                            this.py1 = y;
                            this.py2 = y;
                        }
                        if (y < this.py1) this.py1 = y;
                        if (y > this.py2) this.py2 = y;
                    }
                }
                this.addX = function (x) { this.addPoint(x, null); }
                this.addY = function (y) { this.addPoint(null, y); }

                this.addBoundingBox = function (bb) {
                    this.addPoint(bb.x1, bb.y1);
                    this.addPoint(bb.x2, bb.y2);
                }

                this.addQuadraticCurve = function (p0x, p0y, p1x, p1y, p2x, p2y) {
                    var cp1x = p0x + 2 / 3 * (p1x - p0x); // CP1 = QP0 + 2/3 *(QP1-QP0)
                    var cp1y = p0y + 2 / 3 * (p1y - p0y); // CP1 = QP0 + 2/3 *(QP1-QP0)
                    var cp2x = cp1x + 1 / 3 * (p2x - p0x); // CP2 = CP1 + 1/3 *(QP2-QP0)
                    var cp2y = cp1y + 1 / 3 * (p2y - p0y); // CP2 = CP1 + 1/3 *(QP2-QP0)
                    this.addBezierCurve(p0x, p0y, cp1x, cp2x, cp1y, cp2y, p2x, p2y);
                }

                this.addBezierCurve = function (p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
                    // from http://blog.hackers-cafe.net/2009/06/how-to-calculate-bezier-curves-bounding.html
                    var p0 = [p0x, p0y], p1 = [p1x, p1y], p2 = [p2x, p2y], p3 = [p3x, p3y];
                    this.addPoint(p0[0], p0[1]);
                    this.addPoint(p3[0], p3[1]);

                    for (i = 0; i <= 1; i++) {
                        var f = function (t) {
                            return Math.pow(1 - t, 3) * p0[i]
                            + 3 * Math.pow(1 - t, 2) * t * p1[i]
                            + 3 * (1 - t) * Math.pow(t, 2) * p2[i]
                            + Math.pow(t, 3) * p3[i];
                        }

                        var b = 6 * p0[i] - 12 * p1[i] + 6 * p2[i];
                        var a = -3 * p0[i] + 9 * p1[i] - 9 * p2[i] + 3 * p3[i];
                        var c = 3 * p1[i] - 3 * p0[i];

                        if (a == 0) {
                            if (b == 0) continue;
                            var t = -c / b;
                            if (0 < t && t < 1) {
                                if (i == 0) this.addX(f(t));
                                if (i == 1) this.addY(f(t));
                            }
                            continue;
                        }

                        var b2ac = Math.pow(b, 2) - 4 * c * a;
                        if (b2ac < 0) continue;
                        var t1 = (-b + Math.sqrt(b2ac)) / (2 * a);
                        if (0 < t1 && t1 < 1) {
                            if (i == 0) this.addX(f(t1));
                            if (i == 1) this.addY(f(t1));
                        }
                        var t2 = (-b - Math.sqrt(b2ac)) / (2 * a);
                        if (0 < t2 && t2 < 1) {
                            if (i == 0) this.addX(f(t2));
                            if (i == 1) this.addY(f(t2));
                        }
                    }
                }

                this.isPointInBox = function (x, y) {
                    return (this.x1 <= x && x <= this.x2 && this.y1 <= y && y <= this.y2);
                }

                this.addPoint(x1, y1);
                this.addPoint(x2, y2);
            }
            return fn;
        };

        cardFormatter.canvgPath = canvgPathFunction();
    })();
})();