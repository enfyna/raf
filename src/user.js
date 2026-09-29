{
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            main();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

window.requestIdleCallback(main);

function main() {
    var ts = document.querySelector("article div.relative.flex.border-x.border-embed-highlight.flex-row-reverse");
    if (!ts) {
        log("Profile header not found!");
        return;
    }

    const oc = ts.querySelector("#RAF-Container");
    if (oc) {
        log("Old container still exists! Removing...");
        oc.remove();
    }

    const username = getLoggedInUsername();
    const profile = getUsernameFromURL();

    if (username != profile) {
        log("Viewing another users profile. Nothing to do.");
        return;
    }

    ts.style.backgroundSize = "cover";
    ts.style.backgroundPosition = "center";

    const banner_image = localStorage.getItem("banner_image");
    ts.style.backgroundImage = banner_image ?
        banner_image_style(banner_image) : 'none';

    ts.addEventListener('click', function(e) {
        e.stopPropagation();

        const opt = prompt(`1-Change banner image.
2-Clear banner image.
3-Get current banner image URL.
4-Exit.
Enter your selection:`);
        if (!opt || opt.length != 1) return;

        if (opt == "1") {
            const img = prompt("New background image URL:", banner_image);
            if (!img) return;
            localStorage.setItem("banner_image", img);
            ts.style.backgroundImage = banner_image_style(img);
        } else if (opt == "2") {
            localStorage.removeItem("banner_image");
        } else if (opt == "3") {
            alert(`Current image URL: ${banner_image}`);
        }
        return;
    });

    const c = document.createElement('span');
    c.className = 'flex items-center gap-4';
    c.id = "RAF-Container";

    for (const id of ["RAF-Slot1", "RAF-Slot2", "RAF-Slot3"]) {
        const ach_str = localStorage.getItem(id + "-Achievement");
        if (!ach_str) {
            c.append(makeEmptyTile());
            continue;
        }

        const ach = JSON.parse(ach_str);

        if (ach['id'] !== undefined && ach['id'] !== null && ach['id'].length > 0) {
            const style_str = localStorage.getItem(id + "-Style");
            const style = style_str ?
                JSON.parse(style_str) : { backgroundColor: "#3232324d", emoji: "🏅" };

            c.append(makeBeatenTile(ach, id, style, username));
        }
    }

    ts.append(c);
}

function makeEmptyTile() {
    var wrap = document.createElement("div");
    wrap.style.backgroundColor = "#3232324d";
    wrap.className = "p-1 rounded";

    var img = document.createElement("img");
    img.width = 48;
    img.height = 48;
    img.alt = " ";

    wrap.append(img);

    return wrap;
}

function makeBeatenTile(achievement, data_key, style, username) {
    var wrap = document.createElement("div");
    wrap.style.backgroundColor = style.backgroundColor;
    wrap.className = "p-1";
    wrap.addEventListener('click', function(e) {
        e.stopPropagation();

        const opt = prompt(`1-Clean up this slot.
2-Change emoji.
3-Change border color.
4-Exit.
Enter your selection:`);
        if (!opt || opt.length != 1) return;

        let change = false;

        if (opt == "1") {
            const del = confirm("Are you sure to clean up this slot?");
            if (del) {
                localStorage.removeItem(data_key + "-Achievement");
                main();
                return;
            }
        } else if (opt == "2") {
            const emo = prompt("Enter the new emoji (default: '🏅'):", style.emoji);
            if (emo && emo.length > 0) {
                change = true;
                style.emoji = emo;
            }
        } else if (opt == "3") {
            let col = prompt("Enter the new background color (default: '#3232324d'):", style.backgroundColor);
            if (col && col.length >= 6) {
                if (!col.startsWith("#")) col = "#" + col;
                change = true;
                style.backgroundColor = col;
            }
        }

        if (change) {
            localStorage.setItem(data_key + "-Style", JSON.stringify(style));
            main();
        }
    });

    var span = document.createElement("span");
    span.className = "ra-tile inline";
    span.setAttribute(
        "x-data",
        "tooltipComponent($el, { dynamicType: 'achievement', dynamicId: '" + achievement.id + "'" + (username ? ", dynamicContext: '" + username + "'" : "") + " })"
    );
    span.setAttribute("x-on:mouseover", "showTooltip($event)");
    span.setAttribute("x-on:mouseleave", "hideTooltip");
    span.setAttribute("x-on:mousemove", "trackMouseMovement($event)");
    span.setAttribute("data-beaten", "true");
    span.setAttribute("data-gameid", achievement.game);
    span.setAttribute("data-title", achievement.title || "");
    span.setAttribute("data-tier", achievement.is_hardcore ? "hc" : "sc");

    var a = document.createElement("a");
    a.className = "inline-block";
    a.href = `https://retroachievements.org/achievement/${achievement.id}`;
    a.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 48;
    img.height = 48;
    img.alt = "";
    img.src = achievement.img_src;
    img.className = achievement.is_hardcore ? "goldimage" : "";

    a.appendChild(img);
    span.appendChild(a);
    wrap.appendChild(span);

    var emoji = document.createElement("div");
    emoji.className = "pt-1 text-center";
    emoji.innerText = style.emoji;

    wrap.appendChild(emoji);

    return wrap;
}

function getUsernameFromURL() {
    var parts = location.pathname.split("/").filter(Boolean);
    var name = parts[0] === "user" && parts[1] ? parts[1] : "";
    return decodeURIComponent(name);
}

function getLoggedInUsername() {
    var img = document.querySelector("nav a.nav-link[href*='/user/']");
    if (!img) return "";

    var mm1 = (img.getAttribute("href") || "").match(/\/user\/([^\/?#]+)/);
    if (!mm1) return "";

    return decodeURIComponent(mm1[1]);
}

function banner_image_style(img) {
    return `linear-gradient(69deg, #161616dd 40%, transparent), url('${img}')`;
}

function log(text) {
    console.info(`RAF: ${text}`);
}
