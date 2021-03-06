var http = require('http'),
    moment = require('moment-timezone'),
    express = require('express'),
    async = require('async'),

    raven = require('raven'),
    
    juvenes = require('./parsers/juvenes.js'),
    sodexo = require('./parsers/sodexo.js'),
    fazer = require('./parsers/fazer.js');
    

var app = express();

var sentryEnabled = typeof process.env.SENTRY_DSN !== 'undefined';
var ravenClient;

if (sentryEnabled) {
    ravenClient = new raven.Client(process.env.SENTRY_DSN);
    ravenClient.patchGlobal();

    app.use(raven.middleware.express.requestHandler(process.env.SENTRY_DSN));
}

app.use(function(req, res, next) {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
    });
    
    
    if (req.method === 'OPTIONS') {
        res.status(200).send();
    } else {
        next();
    }
});

app.get(['/', '/:date', '/:date/:lang'], function(req, res, next) {
    var date = moment(req.params.date || new Date(), 'YYYY-MM-DD').tz('Europe/Helsinki'),
        lang = req.params.lang || 'en';
        
    async.parallel([
        function(callback) {
            juvenes.getMenus(date, lang, function(err, menus) {
                if (err) {
                    if (sentryEnabled) {
                        ravenClient.captureException(err);
                    } else {
                        console.log(err);    
                    }
                    
                    callback(null, []);
                    return;
                }
                
                callback(null, menus);
            });
        },
        function(callback) {
            sodexo.getMenus(date, lang, function(err, menus) {
                if (err) {
                    if (sentryEnabled) {
                        ravenClient.captureException(err);
                    } else {
                        console.log(err);    
                    }
                    
                    callback(null, []);
                    return;
                }
                
                callback(null, menus);
            });
        },
        function(callback) {
            fazer.getMenus(date, lang, function(err, menus) {
                if (err) {
                    if (sentryEnabled) {
                        ravenClient.captureException(err);
                    } else {
                        console.log(err);    
                    }
                    
                    callback(null, []);
                    return;
                }
                
                callback(null, menus);
            });
        }
    ], function(err, result) {
        var restaurants = result.reduce(function(prev, current) {
            return prev.concat(current);
        }, [])
        .sort(function(a, b) {
            return (a.restaurant + a.name) < (b.restaurant + b.name) ? -1 : 1;
        });
        
        var allDiets = restaurants
            .map(function(restaurant) {
                return restaurant.menus.map(function(menu) {
                    return menu.meals.map(function(meal) {
                        return meal.contents.map(function(content) {
                            return content.diets || [];
                        }).reduce(function(prev, current) {
                            return prev.concat(current);
                        }, []);
                    }).reduce(function(prev, current) {
                        return prev.concat(current);
                    }, []);
                }).reduce(function(prev, current) {
                    return prev.concat(current);
                }, []);
            })
            .reduce(function(prev, current) {
                return prev.concat(current);
            }, [])
            .filter(function(diet, index, self) {
                return self.indexOf(diet) === index;
            })
            .filter(function(diet) {
                return diet !== '';
            })
            .sort();
        
        res.status(200).send({
            restaurants: restaurants,
            availableDiets: allDiets
        });
    });
});

if (sentryEnabled) {
    app.use(raven.middleware.express.errorHandler(process.env.SENTRY_DSN));
}

app.listen(process.env.PORT || 8080);
console.log('Server listening on port', process.env.PORT || 8080);
