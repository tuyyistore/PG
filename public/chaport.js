// Snippet Chaport Live Chat. Dipisah dari index.html supaya CSP bisa membuang 'unsafe-inline' pada script-src.
(function (w, d, v3) {
  w.chaportConfig = {
    appId: '6ab5db58919f694fe13ac2e8',
    launcher: { show: false }, // launcher default disembunyikan, dibuka lewat tombol custom di UI
  };

  if (w.chaport) return;
  v3 = w.chaport = {};
  v3._q = [];
  v3._l = {};
  v3.q = function () {
    v3._q.push(arguments);
  };
  v3.on = function (e, fn) {
    if (!v3._l[e]) v3._l[e] = [];
    v3._l[e].push(fn);
  };
  var s = d.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = 'https://app.chaport.com/javascripts/insert.js';
  var ss = d.getElementsByTagName('script')[0];
  ss.parentNode.insertBefore(s, ss);
})(window, document);
