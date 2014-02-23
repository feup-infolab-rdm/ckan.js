var CKAN = {};

(function(my) {
  // ## CKAN Backend
  //
  // This provides connection to the CKAN DataStore (v2)
  //
  // General notes
  // 
  // We need 2 things to make most requests:
  //
  // 1. CKAN API endpoint
  // 2. ID of resource for which request is being made
  //
  // There are 2 ways to specify this information.
  //
  // EITHER (checked in order): 
  //
  // * Every dataset must have an id equal to its resource id on the CKAN instance
  // * The dataset has an endpoint attribute pointing to the CKAN API endpoint
  //
  // OR:
  // 
  // Set the url attribute of the dataset to point to the Resource on the CKAN instance. The endpoint and id will then be automatically computed.

  // ### DataStore
  //
  // Simple wrapper around the CKAN DataStore API
  //
  // @param endpoint: CKAN api endpoint (e.g. http://datahub.io/api)
  my.DataStore = function(endpoint) { 
    this.endpoint = endpoint || my.API_ENDPOINT;
    this.endpoint = this.endpoint.replace(/\/$/, '');
    // TODO: ? add /api if not present
  };

  // Raw action search function
  //
  // search({resource_id: ..., limit: 0})
  my.DataStore.prototype.search = function(data, cb) {
    var searchUrl = this.endpoint + '/3/action/datastore_search';
    var jqxhr = jQuery.ajax({
      url: searchUrl,
      type: 'POST',
      data: JSON.stringify(data),
      success: function(data) {
        cb(null, data)
      },
      error: cb
    });
  };

  my.DataStore.prototype.query = function(queryObj, cb) {
    var actualQuery = my._normalizeQuery(queryObj, dataset);
    this.search(actualQuery, function(err, results) {
      var out = {
        total: results.result.total,
        hits: results.result.records
      };
      cb(null, out);
    });
  };

  my.DataStore.prototype.listResources = function(cb) {
    var resourceListUrl = this.endpoint + '/3/action/datastore_search?resource_id=_table_metadata';
    _get({url: resourceListUrl}, cb);
  }

  var _get = function(options, cb) {
    options.success = function(data) {
      cb(null, data);
    }
    options.error = function(obj, obj2, obj3) {
      var err = {
        code: obj.statusCode,
        message: obj2
      }
      cb(err); 
    }
    var jqxhr = jQuery.ajax(options);
  }

  // only put in the module namespace so we can access for tests!
  my._normalizeQuery = function(queryObj, dataset) {
    var actualQuery = {
      resource_id: dataset.id,
      q: queryObj.q,
      filters: {},
      limit: queryObj.size || 10,
      offset: queryObj.from || 0
    };

    if (queryObj.sort && queryObj.sort.length > 0) {
      var _tmp = _.map(queryObj.sort, function(sortObj) {
        return sortObj.field + ' ' + (sortObj.order || '');
      });
      actualQuery.sort = _tmp.join(',');
    }

    if (queryObj.filters && queryObj.filters.length > 0) {
      _.each(queryObj.filters, function(filter) {
        if (filter.type === "term") {
          actualQuery.filters[filter.field] = filter.term;
        }
      });
    }
    return actualQuery;
  };

  // Parse a normal CKAN resource URL and return API endpoint etc
  //
  // Normal URL is something like http://demo.ckan.org/dataset/some-dataset/resource/eb23e809-ccbb-4ad1-820a-19586fc4bebd
  my._parseCkanResourceUrl = function(url) {
    parts = url.split('/');
    var len = parts.length;
    return {
      resource_id: parts[len-1],
      endpoint: parts.slice(0,[len-4]).join('/') + '/api'
    };
  };
}(CKAN));


// Recline Wrapper
//
// Wrap the DataStore to create a Backend suitable for usage in ReclineJS
var recline = recline || {};
recline.Backend = recline.Backend || {};
recline.Backend.Ckan = recline.Backend.Ckan || {};
(function(my) {
  my.__type__ = 'ckan';

  // private - use either jQuery or Underscore Deferred depending on what is available
  var Deferred = _.isUndefined(this.jQuery) ? _.Deferred : jQuery.Deferred;

  // Default CKAN API endpoint used for requests (you can change this but it will affect every request!)
  //
  // DEPRECATION: this will be removed in v0.7. Please set endpoint attribute on dataset instead
  my.API_ENDPOINT = 'http://datahub.io/api';

  // ### fetch
  my.fetch = function(dataset) {
    var wrapper;
    if (dataset.endpoint) {
      wrapper = new my.DataStore(dataset.endpoint);
    } else {
      var out = CKAN._parseCkanResourceUrl(dataset.url);
      dataset.id = out.resource_id;
      wrapper = new CKAN.DataStore(out.endpoint);
    }
    var dfd = new Deferred();
    return my.query({resource_id: dataset.id, limit: 0}, dataset);
  };

  my.query = function(queryObj, dataset) {
    var dfd = new Deferred()
      , wrapper
      ;
    if (dataset.endpoint) {
      wrapper = new CKAN.DataStore(dataset.endpoint);
    } else {
      var out = CKAN._parseCkanResourceUrl(dataset.url);
      dataset.id = out.resource_id;
      wrapper = new CKAN.DataStore(out.endpoint);
    }
    wrapper.search(queryObj, function(err, results) {
      // map ckan types to our usual types ...
      var fields = _.map(results.result.fields, function(field) {
        field.type = field.type in CKAN_TYPES_MAP ? CKAN_TYPES_MAP[field.type] : field.type;
        return field;
      });
      var out = {
        fields: fields,
        useMemoryStore: false
      };
      dfd.resolve(out);  
    });
    return dfd.promise();
  };

  var CKAN_TYPES_MAP = {
    'int4': 'integer',
    'int8': 'integer',
    'float8': 'float'
  };
}(recline.Backend.Ckan));
