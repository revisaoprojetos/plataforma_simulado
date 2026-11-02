/* Runtime mínimo para abrir os protótipos no navegador, sem o editor.
   Lê o <template id="tpl">, chama Component.renderVals(), resolve <sc-if>, {{valores}} e onClick.
   Só serve para navegar e testar os estados do protótipo. Não é código de produção. */
(function () {
  window.DCLogic = class { constructor() { this.state = {}; } setState(o) { this.state = Object.assign({}, this.state, o); render(); } };
  var comp = null, tpl = null;
  function render() {
    var vals = comp.renderVals();
    var t = document.createElement('template'); t.innerHTML = tpl;
    var H = [];
    (function walk(el) {
      Array.prototype.slice.call(el.children).forEach(function (ch) {
        if (ch.tagName === 'SC-IF') {
          var m = /\{\{(\w+)\}\}/.exec(ch.getAttribute('value') || ''); var v = m ? vals[m[1]] : false;
          if (!v) { ch.remove(); return; }
          walk(ch); var p = ch.parentNode; while (ch.firstChild) p.insertBefore(ch.firstChild, ch); ch.remove(); return;
        }
        Array.prototype.slice.call(ch.attributes).forEach(function (a) {
          if (a.name.toLowerCase() === 'onclick') {
            var m = /\{\{(\w+)\}\}/.exec(a.value); ch.removeAttribute(a.name);
            if (m && typeof vals[m[1]] === 'function') { ch.setAttribute('data-h', H.length); H.push(vals[m[1]]); }
            return;
          }
          if (a.value.indexOf('{{') >= 0) ch.setAttribute(a.name, a.value.replace(/\{\{(\w+)\}\}/g, function (_, k) { return vals[k]; }));
        });
        walk(ch);
      });
    })(t.content);
    var root = document.getElementById('root');
    var sx = window.scrollX, sy = window.scrollY;
    root.innerHTML = ''; root.appendChild(t.content);
    root.querySelectorAll('[data-h]').forEach(function (n) { var h = H[+n.getAttribute('data-h')]; n.addEventListener('click', function (e) { h(e); }); });
    window.scrollTo(sx, sy);
  }
  window.DCRuntime = { start: function () { tpl = document.getElementById('tpl').innerHTML; comp = new Component(); render(); } };
})();
