(function () {
  'use strict';

  function removeTrailingSlash(url) {
    return url && url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
  }

  var hook = function (_this, method, callback) {
    var orig = _this[method];

    return function () {
      var args = [], len = arguments.length;
      while ( len-- ) args[ len ] = arguments[ len ];

      callback.apply(null, args);

      return orig.apply(_this, args);
    };
  };

  var doNotTrack = function () {
    var doNotTrack = window.doNotTrack;
    var navigator = window.navigator;
    var external = window.external;

    var msTrackProtection = 'msTrackingProtectionEnabled';
    var msTracking = function () {
      return external && msTrackProtection in external && external[msTrackProtection]();
    };

    var dnt = doNotTrack || navigator.doNotTrack || navigator.msDoNotTrack || msTracking();

    return dnt == '1' || dnt === 'yes';
  };

  (function (window) {
    var window_screen = window.screen;
    var width = window_screen.width;
    var height = window_screen.height;
    var language = window.navigator.language;
    var window_location = window.location;
    var hostname = window_location.hostname;
    var pathname = window_location.pathname;
    var search = window_location.search;
    var localStorage = window.localStorage;
    var document = window.document;
    var history = window.history;

    var script = document.querySelector('script[data-website-id]');

    if (!script) { return; }

    var attr = script.getAttribute.bind(script);
    var website = attr('data-website-id');
    var hostUrl = attr('data-host-url');
    var autoTrack = attr('data-auto-track') !== 'false';
    var dnt = attr('data-do-not-track');
    var cssEvents = attr('data-css-events') !== 'false';
    var domain = attr('data-domains') || '';
    var domains = domain.split(',').map(function (n) { return n.trim(); });

    var eventClass = /^simplemetrics--([a-z]+)--([\w]+[\w-]*)$/;
    var eventSelect = "[class*='simplemetrics--']";

    var trackingDisabled = function () { return (localStorage && localStorage.getItem('simplemetrics.disabled')) ||
      (dnt && doNotTrack()) ||
      (domain && !domains.includes(hostname)); };

    var root = hostUrl
      ? removeTrailingSlash(hostUrl)
      : script.src.split('/').slice(0, -1).join('/');
    var screen = width + "x" + height;
    var listeners = {};
    var currentUrl = "" + pathname + search;
    var currentRef = document.referrer;
    var cache;

    /* Collect metrics */

    var post = function (url, data, callback) {
      var req = new XMLHttpRequest();
      req.open('POST', url, true);
      req.setRequestHeader('Content-Type', 'application/json');
      if (cache) { req.setRequestHeader('x-simplemetrics-cache', cache); }

      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          callback(req.response);
        }
      };

      req.send(JSON.stringify(data));
    };

    var getPayload = function () { return ({
      website: website,
      hostname: hostname,
      screen: screen,
      language: language,
      url: currentUrl,
    }); };

    var assign = function (a, b) {
      Object.keys(b).forEach(function (key) {
        a[key] = b[key];
      });
      return a;
    };

    var collect = function (type, payload) {
      if (trackingDisabled()) { return; }

      post(
        (root + "/api/collect"),
        {
          type: type,
          payload: payload,
        },
        function (res) { return (cache = res); }
      );
    };

    var trackView = function (url, referrer, uuid) {
      if ( url === void 0 ) url = currentUrl;
      if ( referrer === void 0 ) referrer = currentRef;
      if ( uuid === void 0 ) uuid = website;

      collect(
        'pageview',
        assign(getPayload(), {
          website: uuid,
          url: url,
          referrer: referrer,
        })
      );
    };

    var trackEvent = function (event_value, event_type, url, uuid) {
      if ( event_type === void 0 ) event_type = 'custom';
      if ( url === void 0 ) url = currentUrl;
      if ( uuid === void 0 ) uuid = website;

      collect(
        'event',
        assign(getPayload(), {
          website: uuid,
          url: url,
          event_type: event_type,
          event_value: event_value,
        })
      );
    };

    /* Handle events */

    var sendEvent = function (value, type) {
      var payload = getPayload();

      payload.event_type = type;
      payload.event_value = value;

      var data = JSON.stringify({
        type: 'event',
        payload: payload,
      });

      navigator.sendBeacon((root + "/api/collect"), data);
    };

    var addEvents = function (node) {
      var elements = node.querySelectorAll(eventSelect);
      Array.prototype.forEach.call(elements, addEvent);
    };

    var addEvent = function (element) {
      (element.getAttribute('class') || '').split(' ').forEach(function (className) {
        if (!eventClass.test(className)) { return; }

        var ref = className.split('--');
        var type = ref[1];
        var value = ref[2];
        var listener = listeners[className]
          ? listeners[className]
          : (listeners[className] = function () {
              if (element.tagName === 'A') {
                sendEvent(value, type);
              } else {
                trackEvent(value, type);
              }
            });

        element.addEventListener(type, listener, true);
      });
    };

    /* Handle history changes */

    var handlePush = function (state, title, url) {
      if (!url) { return; }

      currentRef = currentUrl;
      var newUrl = url.toString();

      if (newUrl.substring(0, 4) === 'http') {
        currentUrl = '/' + newUrl.split('/').splice(3).join('/');
      } else {
        currentUrl = newUrl;
      }

      if (currentUrl !== currentRef) {
        trackView();
      }
    };

    var observeDocument = function () {
      var monitorMutate = function (mutations) {
        mutations.forEach(function (mutation) {
          var element = mutation.target;
          addEvent(element);
          addEvents(element);
        });
      };

      var observer = new MutationObserver(monitorMutate);
      observer.observe(document, { childList: true, subtree: true });
    };

    /* Global */

    if (!window.simplemetrics) {
      var simplemetrics = function (eventValue) { return trackEvent(eventValue); };
      simplemetrics.trackView = trackView;
      simplemetrics.trackEvent = trackEvent;

      window.simplemetrics = simplemetrics;
    }

    /* Start */

    if (autoTrack && !trackingDisabled()) {
      history.pushState = hook(history, 'pushState', handlePush);
      history.replaceState = hook(history, 'replaceState', handlePush);

      var update = function () {
        if (document.readyState === 'complete') {
          trackView();

          if (cssEvents) {
            addEvents(document);
            observeDocument();
          }
        }
      };

      document.addEventListener('readystatechange', update, true);

      update();
    }
  })(window);

})();
