/* RAF - RetroAchievements Favorite Achievements */
(function() {
    "use strict";

    var MODE_KEY = "raf-mode";
    var API_KEY = "raf-api-key";
    var API_USER_KEY = "raf-api-user";
    var FAV_PREFIX = "raf-fav-";
    var CACHE_PREFIX = "raf-cache-";
    var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    var SCRAPE_CACHE_TTL_MS = 30 * 60 * 1000;

    var STORE = {};
    var usingExtStorage = false;
    var shelfTemplateDoc = null;
    async function ensureShelfTemplate() {
        if (shelfTemplateDoc) return shelfTemplateDoc;
        try {
            var rt = runtime();
            var url = rt && rt.getURL ? rt.getURL("shelf.html") : "shelf.html";
            var res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            var text = await res.text();
            var doc = new DOMParser().parseFromString(text, "text/html");
            shelfTemplateDoc = doc;
            console.info("[RAF] shelf.html loaded");
            return doc;
        } catch (e) {
            console.info("[RAF] shelf.html load failed, using JS fallback", e && e.message ? e.message : e);
            return null;
        }
    }

    /* storage layer (mirrors RABG) */
    function getStorageApi() {
        if (typeof browser !== "undefined" && browser.storage && browser.storage.local) return browser.storage;
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return chrome.storage;
        return null;
    }
    function storageGetAll(area, cb) {
        var done = false;
        function finish(items) { if (!done) { done = true; cb(items || {}); } }
        try { var p = area.get(null); if (p && typeof p.then === "function") { p.then(finish, function() { finish({}); }); return; } } catch (e) { }
        try { area.get(null, function(items) { finish(items); }); } catch (e) { finish({}); }
    }
    function storageSetItems(area, obj) {
        try { var p = area.set(obj); if (p && typeof p.catch === "function") p.catch(function(err) { console.info("[RAF] storage write failed:", err); }); } catch (e) { console.info("[RAF] storage write failed:", e); }
    }
    function storeSet(key, value) {
        STORE[key] = value;
        var api = getStorageApi();
        if (usingExtStorage && api && api.local) { var o = {}; o[key] = value; storageSetItems(api.local, o); }
        else { try { localStorage.setItem("raf-store", JSON.stringify(STORE)); } catch (e) { } }
    }
    function loadAllPrefs(after) {
        var storage = getStorageApi();
        if (storage && storage.local) {
            usingExtStorage = true;
            var fired = false;
            var go = function(items) { if (fired) return; fired = true; STORE = items || {}; after(); };
            storageGetAll(storage.local, go);
            setTimeout(function() { go(STORE); }, 2000);
        } else {
            usingExtStorage = false;
            try { var raw = localStorage.getItem("raf-store"); STORE = raw ? JSON.parse(raw) : {}; } catch (e) { STORE = {}; }
            after();
        }
    }
    function clearCacheForUser(username) {
        try { delete STORE[CACHE_PREFIX + username]; var api = getStorageApi(); if (api && api.local) api.local.remove(CACHE_PREFIX + username); else localStorage.removeItem(CACHE_PREFIX + username); } catch (e) { }
    }
    function startStorageListener() {
        var storage = getStorageApi();
        if (!storage || !storage.onChanged || !storage.onChanged.addListener) return;
        storage.onChanged.addListener(function(changes, area) {
            if (area && area !== "local") return;
            var needRefresh = false;
            var forceReload = false;
            var favChanged = false;
            for (var k in changes) {
                STORE[k] = changes[k].newValue;
                if (k === MODE_KEY || k === API_KEY || k === API_USER_KEY || k.indexOf(FAV_PREFIX) === 0 || k.indexOf(CACHE_PREFIX) === 0) needRefresh = true;
                if (k === API_KEY) forceReload = true;
                if (k.indexOf(FAV_PREFIX) === 0) favChanged = true;
            }
            if (needRefresh) {
                syncFooterControls();
                if (forceReload) {
                    var u = getUsername();
                    if (u) clearCacheForUser(u);
                    refreshShelf(true);
                } else if (favChanged && shelfPickerOpen) {
                    // Don't recreate shelf while picker open – just let picker update locally
                    // Still need to update podium preview without destroying input; do minimal
                    // Defer full refresh until picker closes
                } else {
                    refreshShelf();
                }
            }
        });
    }

    function getMode() { return STORE[MODE_KEY] === "favorites" ? "favorites" : "hardest"; }
    function setMode(v) { storeSet(MODE_KEY, v); }
    function getApiKey() { return (STORE[API_KEY] || "").trim(); }
    function getFavIds(viewer) {
        var v = STORE[FAV_PREFIX + viewer];
        if (!v) return [];
        try { var arr = typeof v === "string" ? JSON.parse(v) : v; if (Array.isArray(arr)) return arr.slice(0, 3); if (arr && Array.isArray(arr.ids)) return arr.ids.slice(0, 3); } catch (e) { }
        return [];
    }
    function setFavIds(viewer, ids) { storeSet(FAV_PREFIX + viewer, ids.slice(0, 3)); }
    function getCache(username) {
        var v = STORE[CACHE_PREFIX + username];
        if (!v) return null;
        try { var o = typeof v === "string" ? JSON.parse(v) : v; return o; } catch (e) { return null; }
    }
    function setCache(username, obj) { storeSet(CACHE_PREFIX + username, JSON.stringify(obj)); }

    function runtime() {
        if (typeof browser !== "undefined" && browser.runtime) return browser.runtime;
        if (typeof chrome !== "undefined" && chrome.runtime) return chrome.runtime;
        return null;
    }
    function getUsername() {
        var parts = location.pathname.split("/").filter(Boolean);
        var name = parts[0] === "user" && parts[1] ? parts[1] : "";
        try { return decodeURIComponent(name); } catch (e) { return name; }
    }
    var _cachedViewer = null;
    function getViewerUsername() {
        if (_cachedViewer) return _cachedViewer;
        try {
            var links = document.querySelectorAll("div.dropdown a.nav-link[href*='/user/']");
            for (var i = 0; i < links.length; i++) {
                var mm = (links[i].getAttribute("href") || "").match(/\/user\/([^\/?#]+)/);
                if (mm) { try { _cachedViewer = decodeURIComponent(mm[1]); } catch (e) { _cachedViewer = mm[1]; } return _cachedViewer; }
            }
        } catch (e) { }
        try {
            var lf = document.querySelector("form[action*='logout']");
            if (lf) {
                var dd = null; try { dd = lf.closest("div.dropdown"); } catch (e) { }
                if (!dd) { var p = lf.parentElement; while (p) { if (p.classList && p.classList.contains("dropdown")) { dd = p; break; } p = p.parentElement; } }
                if (dd) {
                    var mls = dd.querySelectorAll("a[href*='/user/']");
                    for (var j = 0; j < mls.length; j++) {
                        var mm2 = (mls[j].getAttribute("href") || "").match(/\/user\/([^\/?#]+)/);
                        if (mm2) { try { _cachedViewer = decodeURIComponent(mm2[1]); } catch (e) { _cachedViewer = mm2[1]; } return _cachedViewer; }
                    }
                }
            }
        } catch (e) { }
        try {
            var sp = document.querySelector("script[data-page]");
            if (sp) { var data = JSON.parse(sp.textContent || sp.innerHTML || ""); if (data && data.props && data.props.auth && data.props.auth.user) { var u = data.props.auth.user.username || ""; if (u) { _cachedViewer = u; return u; } } }
        } catch (e) { }
        return "";
    }

    /* profile scraping fallback */
    function scrapeProfileFallback(username) {
        var pic = document.querySelector('img[src*="/UserPic/"]');
        var src = pic ? pic.getAttribute("src") : "/UserPic/" + username + ".png";
        if (src && src.indexOf("http") !== 0 && src.indexOf("//") !== 0 && src[0] !== "/") src = "/" + src;
        if (src && src[0] === "/") src = location.origin + src;
        // try to get points from page text
        var totalPoints = 0, totalTrue = 0, rank = 0, motto = "";
        try {
            var bodyText = document.body.innerText || "";
            var m = bodyText.match(/Total Points[^\d]*([\d,]+)/i);
            if (m) totalPoints = parseInt(m[1].replace(/,/g, ""), 10) || 0;
            var m2 = bodyText.match(/Retro Points[^\d]*([\d,]+)/i) || bodyText.match(/True Points[^\d]*([\d,]+)/i);
            if (m2) totalTrue = parseInt(m2[1].replace(/,/g, ""), 10) || 0;
            var m3 = bodyText.match(/Rank[^\d]*#?\s*([\d,]+)/i);
            if (m3) rank = parseInt(m3[1].replace(/,/g, ""), 10) || 0;
            var mottoEl = document.querySelector('[class*="motto"]');
            if (mottoEl) motto = mottoEl.textContent.trim();
        } catch (e) { }
        return { User: username, UserPic: src, TotalPoints: totalPoints, TotalTruePoints: totalTrue, Rank: rank, Motto: motto };
    }

    async function fetchProfileViaAPI(username, apiKey) {
        try {
            var url = location.origin + "/API/API_GetUserProfile.php?y=" + encodeURIComponent(apiKey) + "&u=" + encodeURIComponent(username);
            var res = await fetch(url, { credentials: "same-origin" });
            if (!res.ok) return null;
            var j = await res.json();
            if (!j || !j.User) return null;
            // normalize UserPic to absolute
            if (j.UserPic && j.UserPic[0] === "/") j.UserPic = location.origin + j.UserPic;
            return j;
        } catch (e) { console.info("[RAF] profile API failed", e); return null; }
    }

    async function fetchWithTimeout(url, ms) {
        ms = ms || 15000;
        return Promise.race([
            fetch(url, { credentials: "same-origin" }),
            new Promise(function(_, rej) { setTimeout(function() { rej(new Error("timeout")); }, ms); })
        ]);
    }
    async function fetchAllEarnedViaAPI(username, apiKey, memberSince) {
        var from = 0;
        if (memberSince) {
            var d = new Date(memberSince);
            if (!isNaN(d.getTime())) from = Math.floor(d.getTime() / 1000);
        }
        var to = Math.floor(Date.now() / 1000);
        var attempts = [];
        if (from > 0) attempts.push(from);
        attempts.push(0);
        var lastErr = null;
        for (var ai = 0; ai < attempts.length; ai++) {
            var f = attempts[ai];
            var url = location.origin + "/API/API_GetAchievementsEarnedBetween.php?y=" + encodeURIComponent(apiKey) + "&u=" + encodeURIComponent(username) + "&f=" + f + "&t=" + to;
            console.info("[RAF] fetching via API attempt " + (ai + 1) + "/", url);
            try {
                var res = await fetchWithTimeout(url, 15000);
                console.info("[RAF] API status", res.status);
                if (!res.ok) {
                    var txt = "";
                    try { txt = await res.text(); } catch (e) { }
                    console.info("[RAF] API error body", txt.slice(0, 800));
                    lastErr = new Error("HTTP " + res.status + " " + txt.slice(0, 300));
                    continue;
                }
                var j = await res.json();
                console.info("[RAF] API returned", Array.isArray(j) ? j.length + " items" : typeof j, Array.isArray(j) && j[0] ? JSON.stringify(j[0]).slice(0, 400) : JSON.stringify(j).slice(0, 800));
                if (!Array.isArray(j)) {
                    if (j && (j.error || j.message)) { lastErr = new Error(j.error || j.message); continue; }
                    if (j && j.AchievementID) { j = [j]; } else { lastErr = new Error("Unexpected API response: " + JSON.stringify(j).slice(0, 400)); continue; }
                }
                if (j.length === 0 && ai === 0 && attempts.length > 1) {
                    console.info("[RAF] first attempt returned 0, retrying with f=0");
                    continue;
                }
                return j.map(function(a) {
                    return {
                        id: String(a.AchievementID || a.achievementId || a.ID || a.AchievementId),
                        gameId: String(a.GameID || a.gameId || a.GameId),
                        gameTitle: a.GameTitle || a.gameTitle || "",
                        title: a.Title || a.title || "",
                        description: a.Description || a.description || "",
                        points: parseInt(a.Points || a.points, 10) || 0,
                        trueRatio: parseInt(a.TrueRatio || a.trueRatio, 10) || parseInt(a.Points || a.points, 10) || 0,
                        badgeName: a.BadgeName || a.badgeName || "",
                        hardcore: a.HardcoreMode == 1 || a.hardcoreMode === true,
                        numAwarded: 0
                    };
                });
            } catch (e) {
                console.info("[RAF] API fetch exception", e && e.message ? e.message : e);
                lastErr = e;
            }
        }
        throw lastErr || new Error("API failed after retries");
    }

    function sortHardest(list) {
        return list.slice().sort(function(a, b) {
            if (b.trueRatio !== a.trueRatio) return b.trueRatio - a.trueRatio;
            if (b.points !== a.points) return b.points - a.points;
            // prefer rarer (if we have numAwarded)
            if ((a.numAwarded || 0) !== (b.numAwarded || 0)) return (a.numAwarded || 0) - (b.numAwarded || 0);
            return (a.title || "").localeCompare(b.title || "");
        });
    }

    /* scrape fallback: fetch game pages for TrueRatio/Points */
    function getVisibleGameIds() {
        var scope = document.querySelector("#completion-progress-incomplete") || document.querySelector("#completion-progress-all") || document.querySelector("#usercompletedgamescomponent") || document;
        var rows = scope.querySelectorAll("tr");
        var ids = [];
        var seen = {};
        for (var i = 0; i < rows.length; i++) {
            var link = rows[i].querySelector('a[href*="/game/"]');
            if (!link) continue;
            var m = (link.getAttribute("href") || "").match(/\/game\/(\d+)/);
            if (!m) continue;
            var id = m[1];
            if (seen[id]) continue;
            seen[id] = true;
            ids.push(id);
        }
        return ids;
    }

    async function fetchGamePage(gameId) {
        try {
            var url = location.origin + "/game/" + gameId;
            var res = await fetch(url, { credentials: "same-origin" });
            if (!res.ok) return null;
            var text = await res.text();
            return text;
        } catch (e) { return null; }
    }

    function parseGameAchievements(html, gameId) {
        try {
            var doc = new DOMParser().parseFromString(html, "text/html");
            // Try to find achievements table rows - RA uses various structures
            var rows = doc.querySelectorAll('tr[class*="achievement"], li[class*="achievement"], div[data-achievement-id]');
            var out = [];
            if (!rows.length) {
                // fallback: look for images with badge
                rows = doc.querySelectorAll('img[src*="/Badge/"]');
                // not reliable, fallback to script JSON
            }
            // Try to find embedded JSON in script
            var scripts = doc.querySelectorAll("script");
            for (var s = 0; s < scripts.length; s++) {
                var txt = scripts[s].textContent || "";
                if (txt.indexOf("achievements") !== -1 && txt.indexOf("BadgeName") !== -1) {
                    try {
                        var m = txt.match(/\{[\s\S]*"Achievements"[\s\S]*?\}\s*\]\s*\}\s*\]/);
                    } catch (e) { }
                }
            }
            // Use row parsing
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var badgeImg = r.querySelector('img[src*="/Badge/"]');
                if (!badgeImg) {
                    if (r.tagName === "IMG" && r.src.indexOf("/Badge/") !== -1) badgeImg = r;
                    else continue;
                }
                var src = badgeImg.getAttribute("src") || "";
                var bm = src.match(/\/Badge\/([^\/\.]+)\./);
                if (!bm) continue;
                var badgeName = bm[1];
                // Check earned - look for checkmark, opacity, or class
                var earned = false;
                if (r.classList && (r.classList.contains("earned") || r.classList.contains("unlocked"))) earned = true;
                if (r.querySelector('.earned, .unlocked, [title*="Earned"]')) earned = true;
                // Try to find title/points
                var titleEl = r.querySelector('[class*="title"], strong, b');
                var title = titleEl ? titleEl.textContent.trim() : "";
                var points = 0, trueRatio = 0;
                var ptsEl = r.querySelector('[class*="points"]');
                if (ptsEl) { var pm = ptsEl.textContent.match(/(\d+)/); if (pm) points = parseInt(pm[1], 10); }
                var trEl = r.querySelector('[class*="TrueRatio"], [class*="RetroPoints"]');
                if (trEl) { var tm = trEl.textContent.match(/(\d+)/); if (tm) trueRatio = parseInt(tm[1], 10); }
                if (!trueRatio) trueRatio = points;
                if (!earned) {
                    // some pages mark unearned with grayscale - skip if we can detect not earned
                    // but we only keep earned, so need to detect
                    // Heuristic: if row has link to achievement and no earned marker, consider not earned
                    // For now, skip if not earned and not sure
                    // We'll check if row is inside user's earned list via additional class "unlocked" in HTML when viewing own profile? fallback assume not earned unless marked
                    continue;
                }
                out.push({ id: badgeName, gameId: gameId, gameTitle: "", title: title || badgeName, points: points, trueRatio: trueRatio, badgeName: badgeName, numAwarded: 0 });
            }
            return out;
        } catch (e) { return []; }
    }

    async function fetchHardestViaScrape(username) {
        var ids = getVisibleGameIds();
        if (!ids.length) return [];
        var all = [];
        var chunk = 5;
        for (var i = 0; i < ids.length; i += chunk) {
            var slice = ids.slice(i, i + chunk);
            var promises = slice.map(function(gid) { return fetchGamePage(gid).then(function(html) { if (!html) return []; return parseGameAchievements(html, gid); }); });
            var results = await Promise.all(promises);
            for (var j = 0; j < results.length; j++) all = all.concat(results[j]);
            // small delay to be polite
            await new Promise(function(r) { setTimeout(r, 200); });
            if (all.length > 100) break; // limit
        }
        // If scrape returned nothing (parsing fragility), try API fallback with public endpoint that may work without key?
        // As last resort, try to use recent achievements from profile's HTML json
        if (!all.length) {
            try {
                // Try to find achievements in current profile page's embedded data
                var sp = document.querySelector("script[data-page]");
                if (sp) {
                    var data = JSON.parse(sp.textContent || "");
                    // search for achievements-like structures not reliable, skip
                }
            } catch (e) { }
        }
        return all;
    }

    // function getElementByXPath(path) {
    //     return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    // }

    var _cachedInsertionPoint = null;
    var _cachedInsertionPointChecked = false;
    var _cachedInsertionUrl = null;
    function findShelfInsertionPoint() {
        var curUrl = location.pathname;
        if (_cachedInsertionPointChecked && _cachedInsertionUrl === curUrl) return _cachedInsertionPoint;
        _cachedInsertionUrl = curUrl;
        _cachedInsertionPointChecked = true;
        var ts = document.querySelector("html body.with-footer div.container.lg\\:max-w-none.xl\\:max-w-\\(--breakpoint-xl\\) main.with-sidebar article.order-2 div.relative.mb-2 div.relative.flex.border-x.border-embed-highlight.flex-row-reverse.sm\\:flex-row.gap-x-4.pb-5.bg-embed.-mx-5.px-5.mt-\\[-15px\\].pt-5");
        _cachedInsertionPoint = ts || null;
        return _cachedInsertionPoint;
    }

    function findLeftContainer() {
        var pt = findShelfInsertionPoint();
        if (!pt) return null;
        if (pt.parent) return pt.parent;
        if (pt.parentElement) return pt.parentElement;
        // pt is the insertion element itself (header) - return its parent
        if (pt.appendChild) return pt.parentElement || pt;
        return null;
    }

    function badgeUrl(badgeName) {
        if (!badgeName) return "";
        return location.origin + "/Badge/" + badgeName + ".png";
    }

    function makeStep(ach, place) {
        // Try to use template from shelf.html if available
        if (shelfTemplateDoc) {
            var tmpl = shelfTemplateDoc.getElementById('raf-step-template');
            var emptyTmpl = shelfTemplateDoc.getElementById('raf-step-empty-template');
            if (!ach && emptyTmpl && emptyTmpl.content) {
                var emptyClone = emptyTmpl.content.cloneNode(true);
                var emptyDiv = emptyClone.firstElementChild || emptyClone.querySelector('.raf-step');
                if (emptyDiv) {
                    emptyDiv.setAttribute('data-place', String(place));
                    return emptyDiv;
                }
            }
            if (tmpl && tmpl.content) {
                var clone = tmpl.content.cloneNode(true);
                var div = clone.firstElementChild || clone.querySelector('.raf-step');
                var desc = clone.querySelector('.raf-description');
                if (place == 1)
                    desc.innerText = '😄';
                else if (place == 2)
                    desc.innerText = '🤯';
                else if (place == 3)
                    desc.innerText = '🤫';

                if (div) {
                    div.setAttribute('data-place', String(place));
                    if (!ach) {
                        div.classList.add('raf-empty');
                        var sp = div.querySelector('span');
                        if (sp) sp.textContent = place === 1 ? "No achievement" : "Empty";
                        else {
                            div.textContent = place === 1 ? "No achievement" : "Empty";
                        }
                        return div;
                    }
                    var link = div.querySelector('[data-raf-link]');
                    var img = div.querySelector('[data-raf-badge]');
                    var crown = div.querySelector('[data-raf-crown]');
                    if (link) {
                        link.href = location.origin + "/achievement/" + (ach.id || "");
                        link.target = "_blank";
                        link.title = ""; // (ach.title || "") + (ach.description ? " — " + ach.description : "") + " (" + ach.points + "pts, " + ach.trueRatio + " RetroPts)";
                        if (ach.id) {
                            var span = link.closest('span.inline') || link.parentElement;
                            if (span) {
                                span.setAttribute("x-data", "tooltipComponent($el, { dynamicType: 'achievement', dynamicId: '" + ach.id + "' })");
                                span.setAttribute("x-on:mouseover", "showTooltip($event)");
                                span.setAttribute("x-on:mouseleave", "hideTooltip");
                                span.setAttribute("x-on:mousemove", "trackMouseMovement($event)");
                            }
                        }
                    }
                    if (img) {
                        img.src = badgeUrl(ach.badgeName);
                        // img.alt = ach.title || "";
                        img.loading = "lazy";
                    }
                    if (crown) {
                        if (place === 1) {
                            var rt = runtime();
                            try { crown.src = rt && rt.getURL ? rt.getURL("icons/gold.svg") : ""; } catch (e) { }
                            crown.style.display = "";
                        } else {
                            crown.style.display = "none";
                        }
                    }
                    return div;
                }
            }
        }
        // Fallback manual creation (if shelf.html not loaded)
        var div2 = document.createElement("div");
        div2.className = "raf-step";
        div2.setAttribute("data-place", String(place));
        if (!ach) {
            div2.classList.add("raf-empty");
            var sp2 = document.createElement("span");
            sp2.textContent = place === 1 ? "No achievement" : "Empty";
            div2.appendChild(sp2);
            return div2;
        }
        var wrap = document.createElement("div");
        wrap.className = "raf-badge-wrap";
        var a = document.createElement("a");
        a.href = location.origin + "/achievement/" + (ach.id || "");
        a.target = "_blank";
        a.title = "";
        // a.title = (ach.title || "") + (ach.description ? " — " + ach.description : "") + " (" + ach.points + "pts, " + ach.trueRatio + " RetroPts)";
        var span = document.createElement("span");
        span.className = "inline";
        if (ach.id) {
            span.setAttribute("x-data", "tooltipComponent($el, { dynamicType: 'achievement', dynamicId: '" + ach.id + "' })");
            span.setAttribute("x-on:mouseover", "showTooltip($event)");
            span.setAttribute("x-on:mouseleave", "hideTooltip");
            span.setAttribute("x-on:mousemove", "trackMouseMovement($event)");
        }
        var img2 = document.createElement("img");
        img2.loading = "lazy";
        img2.src = badgeUrl(ach.badgeName);
        img2.alt = ""; //ach.title || "";
        a.appendChild(img2);
        span.appendChild(a);
        wrap.appendChild(span);
        div2.appendChild(wrap);
        return div2;
    }

    function buildShelf(username, profile, hardestAll, favIds, isOwn) {
        // If shelf.html template is available, use it (editable by user)
        var useTemplate = !!(shelfTemplateDoc && shelfTemplateDoc.getElementById && shelfTemplateDoc.getElementById('raf-shelf'));
        var shelf;
        if (useTemplate) {
            var tmpl = shelfTemplateDoc.getElementById('raf-shelf');
            shelf = tmpl.cloneNode(true);
            shelf.id = 'raf-shelf';
            // Ensure fresh podium
            var podium = shelf.querySelector('[data-raf-podium]') || shelf.querySelector('.raf-podium');
            if (podium) {
                podium.innerHTML = '';
                var byIdT = {};
                hardestAll.forEach(function(a) { byIdT[a.id] = a; });
                var favObjsT = favIds.map(function(id) { return byIdT[id] || null; }).filter(Boolean);
                var displayT = [];
                if (getMode() === "favorites") {
                    displayT = favObjsT.slice(0, 3);
                    for (var ii = 0; ii < hardestAll.length && displayT.length < 3; ii++) {
                        var hT = hardestAll[ii];
                        if (favObjsT.some(function(f) { return f.id === hT.id; })) continue;
                        if (displayT.some(function(d) { return d.id === hT.id; })) continue;
                        displayT.push(hT);
                    }
                } else {
                    displayT = hardestAll.slice(0, 3);
                }
                while (displayT.length < 3) displayT.push(null);
                podium.appendChild(makeStep(displayT[0], 1));
                podium.appendChild(makeStep(displayT[1], 2));
                podium.appendChild(makeStep(displayT[2], 3));
            }
            // Notes
            var noteEl = shelf.querySelector('[data-raf-note]');
            if (noteEl) {
                noteEl.style.display = 'none';
                noteEl.textContent = '';
                if (!hardestAll.length) {
                    var key = getApiKey();
                    var err = shelfData.lastError || "";
                    noteEl.textContent = err ? err : (key ? "No achievements found." : "No achievements found. Add API key for full library or ensure Completion Progress is visible (like RABG limitation).");
                    if (err) noteEl.title = err;
                    noteEl.style.display = '';
                    if (key) {
                        var retry = document.createElement("button");
                        retry.type = "button";
                        retry.className = "btn-base btn-base--default btn-base--size-sm";
                        retry.textContent = "Retry";
                        retry.style.margin = "6px auto 0";
                        retry.style.display = "block";
                        retry.addEventListener("click", function() { clearCacheForUser(username); refreshShelf(true); });
                        // Append after note (shelf.html has note as sibling of podium)
                        noteEl.parentNode.insertBefore(retry, noteEl.nextSibling);
                    }
                } else if (!getApiKey()) {
                    noteEl.textContent = "Showing hardest from visible games only. Add API key in footer/popup for full library.";
                    noteEl.style.display = '';
                } else if (shelfData.lastError) {
                    noteEl.textContent = shelfData.lastError;
                    noteEl.style.display = '';
                }
            }
            // Actions - Pick Favorites moved to popup; show Cancel on shelf when picker open
            var actionsEl = shelf.querySelector('[data-raf-actions]');
            if (actionsEl) {
                if (isOwn && shelfPickerOpen) {
                    actionsEl.style.display = '';
                    actionsEl.innerHTML = '';
                    var cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn-base btn-base--default btn-base--size-sm';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', function() { shelfPickerOpen = false; refreshShelf(); renderFooterPicker(); });
                    actionsEl.appendChild(cancelBtn);
                } else {
                    actionsEl.style.display = 'none';
                    actionsEl.innerHTML = '';
                }
            }
            // Picker - now rendered in footer, not in shelf
            var pickerEl = shelf.querySelector('[data-raf-picker]');
            if (pickerEl) {
                pickerEl.style.display = 'none';
            }
            // Clean up any leftover isOwn actions if not own
            if (!isOwn) {
                var acts = shelf.querySelectorAll('[data-raf-actions], .raf-shelf-actions');
                // Keep only if needed; template already hides
            }
            return shelf;
        }
        // Fallback manual creation (if shelf.html failed to load)
        shelf = document.createElement("div");
        shelf.className = "raf-shelf";
        shelf.id = "raf-shelf";
        var byId = {};
        hardestAll.forEach(function(a) { byId[a.id] = a; });
        var favObjs = favIds.map(function(id) { return byId[id] || null; }).filter(Boolean);
        var display = [];
        if (getMode() === "favorites") {
            display = favObjs.slice(0, 3);
            for (var i = 0; i < hardestAll.length && display.length < 3; i++) {
                var h = hardestAll[i];
                if (favObjs.some(function(f) { return f.id === h.id; })) continue;
                if (display.some(function(d) { return d.id === h.id; })) continue;
                display.push(h);
            }
        } else {
            display = hardestAll.slice(0, 3);
        }
        while (display.length < 3) display.push(null);
        var podium2 = document.createElement("div");
        podium2.className = "raf-podium";
        podium2.appendChild(makeStep(display[0], 1));
        podium2.appendChild(makeStep(display[1], 2));
        podium2.appendChild(makeStep(display[2], 3));
        shelf.appendChild(podium2);
        if (!hardestAll.length) {
            var note = document.createElement("div");
            note.className = "raf-shelf-note";
            var key2 = getApiKey();
            var err2 = shelfData.lastError || "";
            note.textContent = err2 ? err2 : (key2 ? "No achievements found." : "No achievements found. Add API key for full library or ensure Completion Progress is visible (like RABG limitation).");
            if (err2) note.title = err2;
            shelf.appendChild(note);
            if (key2) {
                var retry2 = document.createElement("button");
                retry2.type = "button";
                retry2.className = "btn-base btn-base--default btn-base--size-sm";
                retry2.textContent = "Retry";
                retry2.style.margin = "6px auto 0";
                retry2.style.display = "block";
                retry2.addEventListener("click", function() { clearCacheForUser(username); refreshShelf(true); });
                shelf.appendChild(retry2);
            }
        } else if (!getApiKey()) {
            var note2 = document.createElement("div");
            note2.className = "raf-shelf-note";
            note2.textContent = "Showing hardest from visible games only. Add API key in footer/popup for full library.";
            shelf.appendChild(note2);
        } else if (shelfData.lastError) {
            var note3 = document.createElement("div");
            note3.className = "raf-shelf-note";
            note3.textContent = shelfData.lastError;
            shelf.appendChild(note3);
        }
        if (isOwn && shelfPickerOpen) {
            var actionsFallback = document.createElement("div");
            actionsFallback.className = "raf-shelf-actions";
            var cancelFallback = document.createElement("button");
            cancelFallback.type = "button";
            cancelFallback.className = "btn-base btn-base--default btn-base--size-sm";
            cancelFallback.textContent = "Cancel";
            cancelFallback.addEventListener("click", function() { shelfPickerOpen = false; refreshShelf(); renderFooterPicker(); });
            actionsFallback.appendChild(cancelFallback);
            shelf.appendChild(actionsFallback);
        }
        return shelf;
    }

    var shelfPickerOpen = false;
    function togglePicker(username, hardestAll) {
        shelfPickerOpen = !shelfPickerOpen;
        refreshShelf();
        renderFooterPicker();
    }

    function buildPicker(all, favIds, username) {
        var picker = document.createElement("div");
        picker.className = "raf-picker";
        var search = document.createElement("input");
        search.type = "search";
        search.placeholder = "Search achievements...";
        search.autocomplete = "off";
        // Prevent MutationObserver / shelf recreation from stealing focus
        search.addEventListener("mousedown", function(e) { e.stopPropagation(); });
        search.addEventListener("click", function(e) { e.stopPropagation(); });
        picker.appendChild(search);
        var grid = document.createElement("div");
        grid.className = "raf-picker-grid";
        picker.appendChild(grid);
        var info = document.createElement("div");
        info.className = "raf-shelf-note";
        info.textContent = favIds.length + "/3 selected";
        picker.appendChild(info);
        var btnRow = document.createElement("div");
        btnRow.className = "raf-shelf-actions";
        var save = document.createElement("button");
        save.type = "button";
        save.className = "btn-base btn-base--default btn-base--size-sm";
        save.textContent = "Save";
        save.addEventListener("click", function() {
            // Switch to favorites mode so saved picks actually display
            setMode("favorites");
            shelfPickerOpen = false;
            refreshShelf();
            renderFooterPicker();
        });
        var clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn-base btn-base--default btn-base--size-sm";
        clear.textContent = "Clear";
        clear.addEventListener("click", function() { setFavIds(getViewerUsername(), []); favIds.length = 0; updatePickerSelection(); });
        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn-base btn-base--default btn-base--size-sm";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", function() { shelfPickerOpen = false; refreshShelf(); renderFooterPicker(); });
        btnRow.appendChild(clear);
        btnRow.appendChild(cancel);
        btnRow.appendChild(save);
        picker.appendChild(btnRow);

        function renderList(filter) {
            grid.innerHTML = "";
            var f = (filter || "").toLowerCase();
            var list = all.filter(function(a) {
                if (!f) return true;
                return (a.title || "").toLowerCase().indexOf(f) !== -1 || (a.gameTitle || "").toLowerCase().indexOf(f) !== -1;
            }).slice(0, 60);
            list.forEach(function(a) {
                var it;
                if (shelfTemplateDoc) {
                    var itemTmpl = shelfTemplateDoc.getElementById('raf-picker-item-template');
                    if (itemTmpl && itemTmpl.content) {
                        var c = itemTmpl.content.cloneNode(true);
                        it = c.firstElementChild || c.querySelector('.raf-picker-item');
                        if (!it) it = c.querySelector('div');
                        if (it) {
                            it.className = "raf-picker-item" + (favIds.indexOf(a.id) !== -1 ? " raf-selected" : "");
                            var imgT = it.querySelector('[data-raf-picker-img]') || it.querySelector('img');
                            if (imgT) { imgT.src = badgeUrl(a.badgeName); imgT.alt = ""; }
                            var titleEl = it.querySelector('[data-raf-picker-title]');
                            if (titleEl) titleEl.textContent = a.title;
                            else {
                                // fallback: create title span if template missing it
                                var t2 = it.querySelector('span');
                                if (t2) t2.textContent = a.title;
                            }
                            var gameEl = it.querySelector('[data-raf-picker-game]');
                            if (gameEl) gameEl.textContent = a.gameTitle;
                        }
                    }
                }
                if (!it) {
                    it = document.createElement("div");
                    it.className = "raf-picker-item" + (favIds.indexOf(a.id) !== -1 ? " raf-selected" : "");
                    var img = document.createElement("img");
                    img.src = badgeUrl(a.badgeName);
                    img.alt = "";
                    it.appendChild(img);
                    var t = document.createElement("span");
                    t.textContent = a.title;
                    it.appendChild(t);
                    var g = document.createElement("span");
                    g.textContent = a.gameTitle;
                    g.style.color = "var(--text-color-muted, #828282)";
                    it.appendChild(g);
                }
                it.addEventListener("click", function() {
                    var idx = favIds.indexOf(a.id);
                    if (idx !== -1) favIds.splice(idx, 1);
                    else {
                        if (favIds.length >= 3) return;
                        favIds.push(a.id);
                    }
                    setFavIds(getViewerUsername(), favIds);
                    updatePickerSelection();
                });
                grid.appendChild(it);
            });
        }
        function updatePickerSelection() {
            info.textContent = favIds.length + "/3 selected";
            // re-render to update selected class
            renderList(search.value);
        }
        search.addEventListener("input", function() { renderList(search.value); });
        renderList("");
        // Auto-focus without losing due to observer delay
        setTimeout(function() { try { search.focus(); } catch (e) { } }, 50);
        return picker;
    }

    function renderFooterPicker() {
        var existing = document.getElementById('raf-footer-picker');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        if (!shelfPickerOpen) {
            fixFooterHeight();
            return;
        }
        var viewer = getViewerUsername();
        var username = getUsername();
        var isOwn = !!(viewer && username && viewer === username);
        if (!isOwn) return;
        var footer = document.querySelector('footer');
        if (!footer) return;
        var container = footer.querySelector('.container') || footer;
        // Use buildPicker to create picker in footer (not in shelf)
        var all = (shelfData && shelfData.hardest) ? shelfData.hardest : [];
        var favIds = getFavIds(viewer) || [];
        var picker = buildPicker(all, favIds, username);
        picker.id = 'raf-footer-picker';
        picker.style.margin = '12px auto';
        picker.style.maxWidth = '800px';
        container.appendChild(picker);
        fixFooterHeight();
        try { picker.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }

    /* footer settings */
    function buildFooterRow(extraClass) {
        var row = document.createElement("div");
        row.className = "flex mb-3 items-center" + (extraClass ? " " + extraClass : "");
        var label = document.createElement("div");
        var controls = document.createElement("div");
        controls.className = "flex items-center ml-2 gap-2";
        row.appendChild(label);
        row.appendChild(controls);
        return { row: row, label: label, controls: controls };
    }

    function injectFooterSettings() {
        // Removed per user request: settings now only in popup, no footer duplication
        return;
    }

    function syncFooterControls() {
        var sel = document.querySelector(".raf-footer-mode-select");
        if (sel) sel.value = getMode();
        var inp = document.querySelector(".raf-footer-api input");
        if (inp && document.activeElement !== inp) inp.value = getApiKey();
    }

    function fixFooterHeight() {
        var footer = document.querySelector("footer");
        if (!footer || !document.body) return;
        if (!footer.querySelector(".raf-footer-mode")) return;
        if (window.innerWidth < 768) { footer.style.height = "auto"; footer.style.boxSizing = ""; document.body.style.paddingBottom = ""; return; }
        var cs = getComputedStyle(document.documentElement);
        var md = parseInt(cs.getPropertyValue("--footer-height-md"), 10) || 320;
        var lg = parseInt(cs.getPropertyValue("--footer-height-lg"), 10) || 350;
        var min = window.innerWidth >= 1024 ? lg : md;
        footer.style.boxSizing = "border-box";
        footer.style.height = "auto";
        var h = Math.max(footer.offsetHeight, min);
        footer.style.height = h + "px";
        document.body.style.paddingBottom = h + "px";
    }
    var resizeBound = false;

    /* main shelf logic */
    var shelfData = { profile: null, hardest: [], isOwn: false, lastError: "" };
    async function loadShelfData(username, force) {
        var viewer = getViewerUsername();
        var isOwn = !!(viewer && username && viewer === username);
        var apiKey = getApiKey();
        var cache = getCache(username);
        var now = Date.now();
        var needRefresh = true;
        if (!force && cache && cache.ts && (now - cache.ts) < (apiKey ? CACHE_TTL_MS : SCRAPE_CACHE_TTL_MS)) {
            needRefresh = false;
        }
        var profile = null, hardest = [];
        var lastError = "";
        if (!needRefresh && cache) {
            profile = cache.profile;
            hardest = cache.hardest || [];
            lastError = cache.lastError || "";
            console.info("[RAF] using cached hardest", hardest.length, lastError ? " err:" + lastError : "");
        } else {
            // fetch profile
            if (apiKey) {
                profile = await fetchProfileViaAPI(username, apiKey);
                console.info("[RAF] profile via API", profile ? "ok" : "fallback");
            }
            if (!profile) profile = scrapeProfileFallback(username);
            // fetch hardest
            if (apiKey) {
                try {
                    var memberSince = profile.MemberSince || profile.memberSince || "";
                    var all = await fetchAllEarnedViaAPI(username, apiKey, memberSince);
                    hardest = sortHardest(all).slice(0, 60);
                    console.info("[RAF] hardest via API", hardest.length);
                    if (!hardest.length) {
                        console.info("[RAF] API returned 0, trying scrape fallback");
                        var scraped = await fetchHardestViaScrape(username);
                        if (scraped.length) hardest = sortHardest(scraped);
                        else lastError = "API returned 0 achievements. Check username/key, or user has no hardcore unlocks.";
                    }
                } catch (e) {
                    lastError = (e && e.message) ? e.message : String(e);
                    console.info("[RAF] API hardest failed, fallback scrape", lastError);
                    var fallback = await fetchHardestViaScrape(username);
                    hardest = sortHardest(fallback);
                    console.info("[RAF] scrape fallback", hardest.length);
                    if (!hardest.length) lastError = "API error: " + lastError + ". Scrape also returned 0.";
                }
            } else {
                var s = await fetchHardestViaScrape(username);
                hardest = sortHardest(s);
                console.info("[RAF] hardest via scrape", hardest.length);
                if (!hardest.length) lastError = "No API key: scrape found 0 (RA game pages don't show earned for other users). Add API key.";
            }
            if (!hardest.length && apiKey) {
                setCache(username, { ts: now - (CACHE_TTL_MS - 60000), profile: profile, hardest: hardest, lastError: lastError });
            } else {
                setCache(username, { ts: now, profile: profile, hardest: hardest, lastError: lastError });
            }
        }
        shelfData = { profile: profile, hardest: hardest, isOwn: isOwn, lastError: lastError };
        return shelfData;
    }

    async function renderShelfDOM() {
        var username = getUsername();
        if (!username) return;
        // Ensure editable HTML template is loaded (user can edit shelf.html)
        if (!shelfTemplateDoc) {
            try { await ensureShelfTemplate(); } catch (e) { }
        }
        var pt = findShelfInsertionPoint();
        if (!pt) {
            // Fallback to old container logic if insertion point not found
            var container = findLeftContainer();
            if (!container) return;
            var existing2 = document.getElementById("raf-shelf");
            if (existing2 && existing2.parentElement) existing2.parentElement.removeChild(existing2);
            var viewer2 = getViewerUsername();
            var favIds2 = viewer2 ? getFavIds(viewer2) : [];
            var profile2 = shelfData.profile || scrapeProfileFallback(username);
            var hardest2 = shelfData.hardest || [];
            var isOwn2 = shelfData.isOwn;
            var shelf2 = buildShelf(username, profile2, hardest2, favIds2.slice(), isOwn2);
            container.appendChild(shelf2);
            return;
        }
        var existing = document.getElementById("raf-shelf");
        if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
        var viewer = getViewerUsername();
        var favIds = viewer ? getFavIds(viewer) : [];
        var profile = shelfData.profile || scrapeProfileFallback(username);
        var hardest = shelfData.hardest || [];
        var isOwn = shelfData.isOwn;
        var shelf = buildShelf(username, profile, hardest, favIds.slice(), isOwn);
        pt.appendChild(shelf);
    }

    var shelfLoading = false;
    var shelfRenderedOnce = false;
    var lastRefreshTime = 0;
    async function refreshShelf(force) {
        // Debounce: avoid flicker from 24 rapid calls (issue #395)
        var now = Date.now();
        if (!force && now - lastRefreshTime < 800) return;
        lastRefreshTime = now;
        var username = getUsername();
        if (!username) return;
        if (force) {
            if (shelfLoading) return;
            shelfLoading = true;
            try { await loadShelfData(username, true); } catch (e) { console.info("[RAF] load failed", e); }
            shelfLoading = false;
            await renderShelfDOM();
            renderFooterPicker();
            shelfRenderedOnce = true;
            return;
        }
        // Render once from cache; only reload if we have never rendered before
        if (!shelfRenderedOnce && !shelfData.profile && !shelfLoading) {
            shelfLoading = true;
            try { await loadShelfData(username, false); } catch (e) { console.info("[RAF] load failed", e); }
            shelfLoading = false;
        }
        // Avoid re-rendering if shelf already exists at correct spot and not forced
        if (shelfRenderedOnce && document.getElementById('raf-shelf') && !force) {
            // Still ensure footer picker is in sync (no flicker)
            renderFooterPicker();
            return;
        }
        await renderShelfDOM();
        renderFooterPicker();
        shelfRenderedOnce = true;
    }

    /* theme capture for popup */
    function resolveScheme() {
        var v = "";
        try { if (document.body) v = (document.body.getAttribute("data-scheme") || "").toLowerCase(); } catch (e) { }
        if (!v) { try { v = (document.documentElement.getAttribute("data-scheme") || "").toLowerCase(); } catch (e) { } }
        if (v === "black") return "black";
        if (v === "light") return "light";
        if (v === "system") { try { if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light"; } catch (e) { } }
        return "dark";
    }

    function captureSiteTheme() {
        try {
            var probe = document.createElement("span");
            probe.className = "btn-base btn-base--default btn-base--size-sm";
            probe.style.display = "none";
            probe.style.borderWidth = "1px";
            probe.style.borderStyle = "solid";
            document.body.appendChild(probe);
            var cs = getComputedStyle(probe);
            var bcs = getComputedStyle(document.body);
            var scheme = resolveScheme();
            var light = scheme === "light";
            var theme = {
                scheme: scheme,
                menu: bcs.getPropertyValue("--menu-link-color").trim(),
                btnText: (cs.color || "").trim(),
                btnBg: (cs.backgroundColor || "").trim(),
                btnBorder: (cs.borderTopColor || "").trim(),
                btnHoverText: bcs.getPropertyValue("--link-hover-color").trim(),
                btnHoverBorder: bcs.getPropertyValue("--menu-link-color").trim(),
                btnHoverBg: light ? (bcs.getPropertyValue("--color-neutral-100").trim() || "#f5f5f5") : bcs.getPropertyValue("--embed-highlight-color").trim(),
                selectBg: bcs.getPropertyValue("--embed-color").trim(),
                switchOn: bcs.getPropertyValue("--text-color").trim(),
                switchOff: light ? (bcs.getPropertyValue("--color-neutral-200").trim() || "#e5e5e5") : (bcs.getPropertyValue("--color-neutral-700").trim() || "#3f3f46"),
                knob: light ? "#ffffff" : (bcs.getPropertyValue("--color-neutral-50").trim() || "#fafafa"),
                bg: bcs.getPropertyValue("--bg-color").trim(),
                box: bcs.getPropertyValue("--box-bg-color").trim(),
                highlight: bcs.getPropertyValue("--embed-highlight-color").trim(),
                text: bcs.getPropertyValue("--text-color").trim(),
                heading: bcs.getPropertyValue("--heading-color").trim(),
                muted: bcs.getPropertyValue("--text-color-muted").trim()
            };
            if (probe.parentNode) probe.parentNode.removeChild(probe);
            if (theme.btnBg === "rgba(0, 0, 0, 0)" || theme.btnBg === "transparent") theme.btnBg = "";
            if (STORE["rabg-scheme"] !== theme.scheme) storeSet("rabg-scheme", theme.scheme);
            var cur = STORE["raf-site-theme"];
            if (JSON.stringify(cur) !== JSON.stringify(theme)) storeSet("raf-site-theme", theme);
            // also keep legacy key for popup that reads rabg-site-theme
            if (JSON.stringify(STORE["rabg-site-theme"]) !== JSON.stringify(theme)) storeSet("rabg-site-theme", theme);
        } catch (e) { }
    }
    var themeObserver = null;
    function startThemeObserver() {
        if (themeObserver) return;
        var deb = null;
        function scheduleCapture() { if (deb) return; deb = setTimeout(function() { deb = null; captureSiteTheme(); }, 250); }
        themeObserver = new MutationObserver(scheduleCapture);
        try { themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-scheme", "class"] }); } catch (e) { }
        try { if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "data-scheme", "class", "style"] }); } catch (e) { }
        try { var sels = document.querySelectorAll("select[data-choose-theme], select[data-choose-scheme]"); for (var i = 0; i < sels.length; i++) sels[i].addEventListener("change", scheduleCapture); } catch (e) { }
        try { if (window.matchMedia) { var mq = window.matchMedia("(prefers-color-scheme: light)"); var onChange = function() { scheduleCapture(); }; if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange); } } catch (e) { }
        setTimeout(function() { captureSiteTheme(); }, 1500);
    }

    /* messaging */
    function startMessageListener() {
        var rt = runtime();
        if (!rt || !rt.onMessage || !rt.onMessage.addListener) return;
        rt.onMessage.addListener(function(msg, sender, respond) {
            if (!msg || typeof msg !== "object") return;
            var username = getUsername();
            var viewer = getViewerUsername();
            var isOwn = !!(viewer && username && viewer === username);
            if (msg.type === "raf-get-state") {
                respond({ ok: true, ownProfile: isOwn, mode: getMode(), fav: viewer ? getFavIds(viewer) : [], hardestCount: (shelfData.hardest || []).length, hasApiKey: !!getApiKey() });
            } else if (msg.type === "raf-set-mode") {
                if (msg.mode === "hardest" || msg.mode === "favorites") setMode(msg.mode);
                respond({ ok: true });
            } else if (msg.type === "raf-set-fav") {
                if (isOwn && Array.isArray(msg.ids)) { setFavIds(viewer, msg.ids.slice(0, 3)); respond({ ok: true }); } else respond({ ok: false });
            } else if (msg.type === "raf-toggle-picker") {
                if (isOwn) { shelfPickerOpen = !shelfPickerOpen; refreshShelf(); renderFooterPicker(); }
                respond({ ok: true, open: shelfPickerOpen });
            } else if (msg.type === "raf-open-picker") {
                if (isOwn) { shelfPickerOpen = true; refreshShelf(); renderFooterPicker(); var el = document.getElementById("raf-footer-picker") || document.getElementById("raf-shelf"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
                respond({ ok: true });
            } else if (msg.type === "rabg-get-state") {
                // passthrough for RABG compatibility if both installed? ignore
            }
        });
    }

    var observer = null, debounce = null;
    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(function() {
            if (debounce) return;
            debounce = setTimeout(function() {
                debounce = null;
                injectFooterSettings();
                fixFooterHeight();
                // Only re-render if shelf was removed (SPA navigation), not on every mutation
                if (!document.getElementById('raf-shelf')) {
                    var pt = findShelfInsertionPoint();
                    if (pt) refreshShelf();
                }
            }, 800);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    var retryTimer = null;
    function scheduleRetry() {
        if (retryTimer) return;
        if (document.getElementById('raf-shelf')) return;
        var tries = 0;
        retryTimer = setInterval(function() {
            if (document.getElementById('raf-shelf')) { clearInterval(retryTimer); retryTimer = null; return; }
            var pt = findShelfInsertionPoint();
            if (pt || ++tries > 5) { clearInterval(retryTimer); retryTimer = null; if (pt) refreshShelf(); }
        }, 800);
    }

    function run() {
        injectFooterSettings();
        captureSiteTheme();
        startThemeObserver();
        refreshShelf().then(function() {
            // if failed to find container, retry
            if (!findLeftContainer()) scheduleRetry();
        });
        startObserver();
    }

    function init() {
        loadAllPrefs(function() {
            startStorageListener();
            startMessageListener();
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
            else run();
        });
    }
    init();
})();
