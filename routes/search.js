var express = require('express');
var router = express.Router();
const fs = require('fs');
const fetch = require('node-fetch');    // must use node-fetch, fetch is something else

const CACHE_RESULTS_IN_MINUTES = 5;

function saveStores(req, inputData) {
    var stores = req.app.get('stores');

    inputData.forEach((item) => {
        var target = stores.find((store) => { return store.StoreNumber == item.StoreNumber; });

        if (!target) {
            var newItem = {
                StoreNumber: item.StoreNumber,
                StoreName: item.StoreInfo.StoreName
            };

            stores.push(newItem);
        }
    });
}

function map(inputData, results) {
    inputData.forEach((item) => {
        var newItem = {
            StoreNumber: item.StoreNumber,
            StoreName: item.StoreInfo.StoreName,
            Status: item.StockStatus[0].Message,
            StockCount: item.StockStatus[0].StockCount,
            Aisle: item.StoreAisleData ? item.StoreAisleData.Success ? item.StoreAisleData.Response : "Unknown" : "No data" 
        };

        results.push(newItem);
    });
}

router.get('/stores', (req, res, next) => {
    res.render('Stores', { title: '', data: req.app.get('stores') });
});

router.get('/',  async (req, res, next) => {
    var data = {
        item_id: req.query.item_id,
        results: []
    };

    if (!req.query || !req.query.item_id) {
        res.render('search', { title: 'Search', message: 'No item_id specified', data: data})
        return;
    }

    var cache = req.app.get('cache');
    var item_id = req.query.item_id;
    var store = 2206;   // Willetton store

    var url = `https://www.bunnings.com.au/api/v1/store/${store}/nearest/20/${item_id}`

    var now = new Date();
    var results = null;

    if (cache[url]) {
        var entry = cache[url];
        if (entry.expires > now) {
            data.results = entry.data;
            res.render('search', { title: 'Search', message: `Cached data from ${entry.fetchTimestamp}`, data: data})
            return;
        }
    }

    var currentStoreUrl = `https://www.bunnings.com.au/api/v1/store/${store}/${item_id}`;

    var fetchTimestamp = new Date();
    var responsePromise = fetch(url);
    var currentStoreResponsePromise = fetch(currentStoreUrl);

    // parallelise requests
    var response = await responsePromise;
    var currentStoreResponse = await currentStoreResponsePromise;

    results = await response.json();
    var currentStoreResults = await currentStoreResponse.json();

    var expires = new Date();
    expires.setMinutes(expires.getMinutes() + CACHE_RESULTS_IN_MINUTES);
    console.log(`Time is ${now}, expiring at ${expires}`);
    map(results, data.results);

    // add current store stock
    data.results.push({
        StoreNumber: currentStoreResults.StoreNumber,
        StoreName: 'Willetton',
        Status: currentStoreResults.StockStatus[0].Message,
        StockCount: currentStoreResults.StockStatus[0].StockCount,
        Aisle: 'Unknown' 
    });

    saveStores(req, results);

    cache[url] = {
        fetchTimestamp: fetchTimestamp,
        expires: expires,
        data: data.results
    };

    res.render('search', { title: 'Search', data: data})
});

router.get('/dumpcache', (req, res) => {
    const cache = req.app.get('cache');

    res.end(JSON.stringify(cache));
});

router.get('/test', function(req, res, next) {
    var data = {
        item_id: req.query.item_id,
        results: []
    };

    var dataString = fs.readFileSync('assets/1563497.json');
    var inputData = JSON.parse(dataString);

    saveStores(req, inputData);

    map(inputData, data.results);

    res.render('search', { title: 'Search', message: 'Test mode', data: data });
});

module.exports = router;
