var TextEntropy = {};

TextEntropy.utils = (function() {
    "use strict";
    var testSentence = "The fundamental problem of communication is that of reproducing at one point either exactly or approximately a message selected at another point. Frequently, the messages have meaning; that is, they refer to, or are correlated according to, some system with certain physical or conceptual entities. These semantic aspects of communication are irrelevant to the engineering problem. The significant aspect is that the actual message is one selected from a set of possible messages.";
    var smallerTestSentence = "One small step for man; one giant leap for mankind.";
    var tokenize = function(string) { return string.replace(/,/g,'').split(/(?=[-.;:\'!@#$^*()%^&+=\]\[?\"<>](?:\s+|$))|\s+/) };
    var eachk_iter = function(list, fk, i, k) {
	list.length == 0 ? k() : fk(list[0], i, function() { eachk_iter(list.slice(1), fk, i+1, k); });
    };
    var eachk = function(list, fk, k) { eachk_iter(list, fk, 0, k) };

    // :: [ProbabilityHash] -> [StackedAreaData]
    // ProbabilityHash = {word::Int, continues::Bool, value::Double}
    // StackedAreaData = [{key::a, value::(Numeric a => a), date::Int}]
    var convertProbabilityHashesToStackedAreaData = function(oneWordProbHashes) {
	return oneWordProbHashes.map(function(h) {
		var next = h.continues ? 1 : 0;
		return [{key: h.word, value: h.value, date: 0}, {key: h.word, value: h.value, date: 8}, {key: h.word, value: next, date: 9}, {key: h.word, value: next, date: 10}];
	    });
    };
    var apiPath = "http://vivam.us/ngrams/"; // this is where I've hosted lsb/text-entropy-api
    var smallWordListPath = apiPath + "idToWord-small.json";
    var largeWordListPath = apiPath + "idToWord.json";
    var statsPath = function(order, ids, isSmall) { return apiPath + "stats?" + (isSmall ? "oneword=true&" : "") + "order=" + order + "&ids=" + ids.join(','); };
    return { testSentence: testSentence, smallerTestSentence: smallerTestSentence, tokenize: tokenize, eachk: eachk, convertProbabilityHashesToStackedAreaData: convertProbabilityHashesToStackedAreaData, apiPath: apiPath, smallWordListPath: smallWordListPath, largeWordListPath: largeWordListPath, statsPath: statsPath};
})();

TextEntropy.d3utils = {
    makeStackedAreaWithTooltip: function(d3Selection, data, activeOpacity, inactiveOpacity, width, height, keyToTooltipText, tooltip) { // kudos to bl.ocks.org/3020685
	"use strict";
	var x = d3.time.scale().range([0, width]);
	var y = d3.scale.linear().range([height, 0]);
	var colors = d3.scale.category10().range();
	var r = Math.floor(10 * Math.random());
	var shiftedColors = colors.slice(r).concat(colors.slice(0,r));
	var z = d3.scale.ordinal().range(shiftedColors);
	var stack = d3.layout.stack()
                      .offset("zero")
                      .x(function(d) { return d.date; }).y(function(d) { return d.value; });
	var area = d3.svg.area()
                     .interpolate("basis")
                     .x(function(d) { return x(d.date); })
                     .y0(function(d) { return y(d.y0); })
                     .y1(function(d) { return y(d.y0 + d.y); });

	var getOpacity = function(values) { return values[values.length - 1].value == 1 ? activeOpacity : inactiveOpacity };

	var svg = d3Selection.append("svg").attr("width", width).attr("height", height);

	var layers = stack(data);

	x.domain(d3.extent(data[0], function(d) { return d.date; }));
	y.domain([0, d3.max(d3.transpose(data), function(date_key_values) { return d3.sum(date_key_values, function(date_key_value) { return date_key_value.value }) })]);

	svg.selectAll(".layer")
             .data(layers)
           .enter().append("path")
             .attr("class", "layer")
             .attr("d", area)
             .style("opacity", getOpacity)
              .on("mouseover", function(d) { tooltip.style("visibility", "visible"); tooltip.text(keyToTooltipText(d[0].key, d[0].value)); })
              .on("mousemove", function() { var mouseCoords = d3.mouse(document.body); tooltip.style("left", (mouseCoords[0] + 15) + "px" ); tooltip.style("top", (mouseCoords[1] + 15) + "px"); })
              .on("mouseout", function() { tooltip.style("visibility", "hidden"); })
              .style("fill", function(d, i) { return z(i); });

	return svg;
    }
};

// the API endpoint deals in word ids, not words.
TextEntropy.word_id_mapping = (function() {
    "use strict";
    var wordToId = {};
    var idToWord = [];
    var loadWords = function(words) {
        idToWord = words;
	idToWord.forEach(function(word,id) { wordToId[word] = id });
    };
    var xhrFetchK = function(isSmall, k) { d3.json((isSmall ? TextEntropy.utils.smallWordListPath : TextEntropy.utils.largeWordListPath), k); };
    var byId = function(id) { return idToWord[id] };
    var byWord = function(word) { return wordToId[word] };
    return { loadWords: loadWords, byId: byId, byWord: byWord, xhrFetchK: xhrFetchK };
})();

// it's impractical to move ~32GB of statistical models into the browser, so we make an external call
TextEntropy.ngramDataIO = (function() {
    "use strict";
    var sentenceToProbabilityHashesK = function(string, order, isSmall, callback) {
	var wordIds = TextEntropy.utils.tokenize(string).map(function(word) { return TextEntropy.word_id_mapping.byWord(word) || 0 })
	d3.json(TextEntropy.utils.statsPath(order,wordIds,isSmall), callback);
    };
    var sentenceToFullProbabilityHashesK = function(string, order, callback) { sentenceToProbabilityHashesK(string, order, false, callback) };
    var sentenceToSmallProbabilityHashesK = function(string, order, callback) { sentenceToProbabilityHashesK(string, order, true, callback) };
    return {sentenceToFullProbabilityHashesK: sentenceToFullProbabilityHashesK, sentenceToSmallProbabilityHashesK: sentenceToSmallProbabilityHashesK};
})();

TextEntropy.d3Visualizations = {
    renderProbabilityHashesInWrapper: function(wrapper, probabilityHashes, width, height, wordsPerLine) {
	"use strict";
	if(console) console.log("total bits: ", d3.sum(d3.merge(probabilityHashes).filter(function(probabilityHash) { return probabilityHash.continues }), function(probabilityHash) { return probabilityHash.value == 0 ? Math.log(500000) : (Math.log(probabilityHash.value) / (0 - Math.log(2))) }));

	var renderKey = function(id, prob) {
	    var word = TextEntropy.word_id_mapping.byId(id);
	    if(word == null)
		return "no data";
	    if(prob == null)
		return word;
	    return word + ' (' + Math.round(100*prob) + '%)';
	};
	wrapper.attr("width", width * wordsPerLine).attr("height", (height) * Math.ceil(probabilityHashes.length/wordsPerLine));
	TextEntropy.utils.eachk(probabilityHashes, function(oneWordProbHashes,i,k) {
	    var continuingWord = oneWordProbHashes.filter(function(hash) { return hash.continues })[0].word;
	    var tooltip = d3.select("#tooltip");
	    var stackedArea = TextEntropy.d3utils.makeStackedAreaWithTooltip(wrapper, TextEntropy.utils.convertProbabilityHashesToStackedAreaData(oneWordProbHashes), 0.3, 1.0, width, height, renderKey, tooltip);
	    stackedArea.attr("x", (i % wordsPerLine) * width).attr("y", Math.floor(i/wordsPerLine) * (height));
	    stackedArea.append("text").attr("class", "passage-word").text(renderKey(continuingWord)).attr("x","95%").attr("y","50%");
	    setTimeout(k,0);
	}, function(){});
    }
};

TextEntropy.dataVisualizations = {
    renderSentence: function(sentence, order, eachWidth, eachHeight, wordsPerLine, wrapper) {
	"use strict";
	if(!wrapper) { wrapper = d3.select("#wrapper"); }
	wrapper.selectAll("*").remove();
	TextEntropy.ngramDataIO.sentenceToFullProbabilityHashesK(sentence, order, function(probabilityHashes) {
		TextEntropy.d3Visualizations.renderProbabilityHashesInWrapper(wrapper, probabilityHashes, eachWidth, eachHeight, wordsPerLine);
	    });
    }
};
