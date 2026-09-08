/* RAF popup */
(function () {
  "use strict";
  var MODE_KEY = "raf-mode";
  var API_KEY = "raf-api-key";
  var POPUP_THEME_KEY = "rabg-popup-theme";
  var MODE_OPTIONS = [["hardest", "Hardest 3"], ["favorites", "Favorites (fill with hardest)"]];
  var THEME_OPTIONS = [["auto", "Auto (match site)"], ["dark", "Dark"], ["black", "Black"], ["light", "Light"]];

  function storageArea() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) return browser.storage.local;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return chrome.storage.local;
    return null;
  }
  function getStore(cb) {
    var area = storageArea();
    if (!area) { cb({}); return; }
    var done = false;
    function finish(items) { if (!done) { done = true; cb(items || {}); } }
    try { var p = area.get(null); if (p && typeof p.then === "function") { p.then(finish, function () { finish({}); }); return; } } catch (e) {}
    try { area.get(null, function (items) { finish(items); }); } catch (e) { finish({}); }
  }
  function setKey(key, value) {
    var area = storageArea(); if (!area) return;
    var obj = {}; obj[key] = value;
    try { var p = area.set(obj); if (p && typeof p.catch === "function") p.catch(function () {}); } catch (e) {}
  }
  function knownSettingsKey(k) {
    return k.indexOf("raf-") === 0 && k !== "raf-store" && k !== "rabg-site-theme" && k !== "rabg-scheme";
  }
  var RABG_VARS = ["--rabg-bg","--rabg-panel","--rabg-border","--rabg-text","--rabg-heading","--rabg-muted","--rabg-menu","--rabg-select-bg","--rabg-btn-bg","--rabg-btn-border","--rabg-btn-text","--rabg-btn-hover-bg","--rabg-btn-hover-border","--rabg-btn-hover-text","--rabg-switch-on","--rabg-switch-off","--rabg-knob","--rabg-slider"];
  function applySiteTheme(t, scheme) {
    var root = document.documentElement;
    root.classList.remove("rabg-scheme-dark","rabg-scheme-black","rabg-scheme-light");
    var sch = scheme || (t && t.scheme);
    if (sch === "black" || sch === "light" || sch === "dark") root.classList.add("rabg-scheme-" + sch);
    for (var i=0;i<RABG_VARS.length;i++) root.style.removeProperty(RABG_VARS[i]);
    if (!t || typeof t !== "object") return;
    var r=root.style;
    var map={"--rabg-bg":t.bg,"--rabg-panel":t.box,"--rabg-border":t.highlight,"--rabg-text":t.text,"--rabg-heading":t.heading,"--rabg-muted":t.muted,"--rabg-menu":t.menu,"--rabg-select-bg":t.selectBg,"--rabg-btn-bg":t.btnBg,"--rabg-btn-border":t.btnBorder,"--rabg-btn-text":t.btnText,"--rabg-btn-hover-bg":t.btnHoverBg,"--rabg-btn-hover-border":t.btnHoverBorder,"--rabg-btn-hover-text":t.btnHoverText,"--rabg-switch-on":t.switchOn,"--rabg-switch-off":t.switchOff,"--rabg-knob":t.knob,"--rabg-slider":t.switchOn};
    for (var k in map) if (map[k]) r.setProperty(k, map[k]);
  }
  function tabsApi() {
    if (typeof browser !== "undefined" && browser.tabs) return browser.tabs;
    if (typeof chrome !== "undefined" && chrome.tabs) return chrome.tabs;
    return null;
  }
  function withActiveTab(cb) {
    var tabs = tabsApi(); if (!tabs) { cb(null); return; }
    try { var p = tabs.query({ active: true, currentWindow: true }); if (p && typeof p.then === "function") { p.then(function (t) { cb(t && t[0] ? t[0].id : null); }, function () { cb(null); }); return; } } catch (e) {}
    try { tabs.query({ active: true, currentWindow: true }, function (t) { cb(t && t[0] ? t[0].id : null); }); } catch (e) { cb(null); }
  }
  function sendToTab(tabId, msg, cb) {
    var tabs = tabsApi(); if (!tabs || tabId==null) { cb(null); return; }
    try { var p = tabs.sendMessage(tabId, msg); if (p && typeof p.then === "function") { p.then(function (r) { cb(r||null); }, function(){ cb(null);}); return; } } catch (e) {}
    try { tabs.sendMessage(tabId, msg, function(r){ cb(r||null);}); } catch(e){ cb(null); }
  }

  var $ = function(id){ return document.getElementById(id); };
  var modeSel = $("mode");
  var apiInput = $("apikey");
  var editBtn = $("edit");
  var themeSel = $("popup-theme");
  var statusEl = $("status");

  MODE_OPTIONS.forEach(function(o){ var op=document.createElement("option"); op.value=o[0]; op.textContent=o[1]; modeSel.appendChild(op); });
  THEME_OPTIONS.forEach(function(o){ var op=document.createElement("option"); op.value=o[0]; op.textContent=o[1]; themeSel.appendChild(op); });

  function render(store){
    var m = store[MODE_KEY];
    var ok=false; for(var i=0;i<MODE_OPTIONS.length;i++) if(MODE_OPTIONS[i][0]===m) ok=true;
    modeSel.value = ok ? m : "hardest";
    apiInput.value = store[API_KEY] || "";
    var pref = store[POPUP_THEME_KEY];
    var okT=false; for(var j=0;j<THEME_OPTIONS.length;j++) if(THEME_OPTIONS[j][0]===pref) okT=true;
    themeSel.value = okT ? pref : "auto";
  }
  modeSel.addEventListener("change", function(){ setKey(MODE_KEY, modeSel.value); statusEl.textContent="Mode saved"; setTimeout(function(){ statusEl.textContent="";},1500); });
  var saveTimer=null;
  apiInput.addEventListener("input", function(){
    if(saveTimer) clearTimeout(saveTimer);
    statusEl.textContent="Saving...";
    saveTimer=setTimeout(function(){ setKey(API_KEY, apiInput.value.trim()); statusEl.textContent="API key saved"; setTimeout(function(){ statusEl.textContent="";},1500); },600);
  });
  themeSel.addEventListener("change", function(){ setKey(POPUP_THEME_KEY, themeSel.value); getStore(applyStoreTheme); });

  function setEditButton(state){
    var own = !!(state && state.ok && state.ownProfile);
    editBtn.disabled = !own;
    editBtn.title = own ? "Open picker on profile page" : "Open your own profile to pick favorites (private)";
  }
  function refreshEditButton(){
    withActiveTab(function(tabId){ sendToTab(tabId, {type:"raf-get-state"}, function(s){ if(s) setEditButton(s); }); });
  }
  editBtn.addEventListener("click", function(){
    withActiveTab(function(tabId){ sendToTab(tabId, {type:"raf-open-picker"}, function(){ window.close(); }); });
  });

  $("export").addEventListener("click", function(){
    getStore(function(store){
      try{
        var payload={};
        for(var k in store) if(knownSettingsKey(k)) payload[k]=store[k];
        var json=JSON.stringify(payload,null,2);
        var d=new Date(); var stamp=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);
        var blob=new Blob([json],{type:"application/json"}); var url=URL.createObjectURL(blob);
        var a=document.createElement("a"); a.href=url; a.download="raf-settings-"+stamp+".json"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function(){ URL.revokeObjectURL(url); },1000);
      }catch(e){ console.info("[RAF popup] Export failed: "+e); }
    });
  });
  $("import").addEventListener("click", function(){
    var inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
    inp.addEventListener("change", function(){
      if(!inp.files || !inp.files[0]) return;
      var reader=new FileReader();
      reader.onload=function(){
        try{ var data=JSON.parse(String(reader.result)); var count=0; for(var k in data) if(knownSettingsKey(k)){ setKey(k, data[k]); count++; } if(count) statusEl.textContent="Imported "+count+" keys"; }catch(e){ statusEl.textContent="Import failed"; }
      };
      reader.readAsText(inp.files[0]);
    });
    inp.click();
  });

  function applyStoreTheme(store){
    var pref = store[POPUP_THEME_KEY];
    var forced = (pref==="dark"||pref==="black"||pref==="light") ? pref : null;
    var site=store["rabg-site-theme"]; // reuse RABG theme capture if RAF not yet captured? keep same key as content writes
    var site2=store["raf-site-theme"];
    var theme = site2 || site;
    var scheme = store["rabg-scheme"] || (theme && theme.scheme);
    if(forced) applySiteTheme(null, forced);
    else applySiteTheme(theme, scheme);
  }

  getStore(function(store){ render(store); applyStoreTheme(store); refreshEditButton(); });
  (function(){
    var st=(typeof browser!=="undefined" && browser.storage) || (typeof chrome!=="undefined" && chrome.storage);
    if(st && st.onChanged && st.onChanged.addListener){
      st.onChanged.addListener(function(changes, area){
        if(area && area!=="local") return;
        if(changes["rabg-site-theme"]||changes["raf-site-theme"]||changes["rabg-scheme"]||changes[POPUP_THEME_KEY]) getStore(applyStoreTheme);
      });
    }
  })();
})();
