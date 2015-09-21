//The cardformatter namespace
(function () {
    var cardFormatter = window.cardFormatter || {};
    window.cardFormatter = cardFormatter;

    //The cardDrawer member of the namespace
    (function () {
        var draw = function (item) {
            var context = item.canvas.getContext('2d');
            var scale = item.zoom / 100;
            context.scale(scale, scale);

            var eachWidth = item.rows[0][0].image.width;
            var eachHeight = item.rows[0][0].image.height;
            for (var y = 0; y < item.y; y++) {
                if (item.rows[y]) {
                    for (var x = 0; x < item.x; x++) {
                        if (item.rows[y][x]) {
                            context.drawImage(item.rows[y][x].image, x * eachWidth, y * eachHeight);
                        }
                    }
                }
            }
        };

        cardFormatter.stitcher = {
            draw: draw
        }
    })();
})();