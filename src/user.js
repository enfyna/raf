const DEFAULT_BANNER_STYLE = {
    image: "none", stop: "40", rotation: "69",
    color1: "#161616dd", color2: "#00000000",
};
const DEFAULT_ACHIEVEMENT_STYLE = {
    backgroundColor: "#3232324d", emoji: "🏅"
};

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
    var banner = document.querySelector("article div.relative.flex.border-x.border-embed-highlight.flex-row-reverse");
    if (!banner) {
        console.error("RAF: Profile banner not found!");
        return;
    }

    const oc = banner.querySelector("#RAF-Container");
    if (oc) {
        console.info("RAF: Old container still exists! Removing...");
        oc.remove();
    }

    const username = getLoggedInUsername();
    const profile = getUsernameFromURL();

    if (username != profile) {
        console.info("RAF: Viewing another users profile. Nothing to do.");
        return;
    }

    const glb_rank = banner.querySelector("a[href*='/globalRanking.php']");
    glb_rank.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    banner.style.backgroundSize = "cover";
    banner.style.backgroundPosition = "center";

    const banner_data = localStorage.getItem("banner");
    const banner_style = banner_data ?
        JSON.parse(banner_data) : { ...DEFAULT_BANNER_STYLE };
    banner.style.backgroundImage = banner_image_style(banner_style);

    banner.addEventListener('click', function(e) {
        e.stopPropagation();

        const opt = prompt(`1-Change banner image.
2-Clear banner image.
3-Change gradient rotation.
4-Change gradient stop.
5-Change gradient main color.
6-Change gradient secondary color.
7-Reset all gradient settings to default.
8-Exit.
Enter your selection:`);
        if (!opt || opt.length != 1) return;

        if (opt == "1") {
            const img = prompt("New background image URL: [http link of the image]", banner_style.image);
            if (!img) return;
            banner_style.image = img;
        } else if (opt == "2") {
            banner_style.image = 'none';
        } else if (opt == "3") {
            const rot = prompt(`New gradient rotation degree: (default: ${DEFAULT_BANNER_STYLE.rotation}) [percentage value]`, banner_style.rotation);
            if (!rot) return;
            banner_style.rotation = rot;
        } else if (opt == "4") {
            const stp = prompt(`New gradient stop: (default: ${DEFAULT_BANNER_STYLE.stop}) [percentage value]`, banner_style.stop);
            if (!stp) return;
            banner_style.stop = stp;
        } else if (opt == "5") {
            let col = prompt(`New gradient main color: (default: ${DEFAULT_BANNER_STYLE.color1}) [hex color notation, #rrggbbaa]`, banner_style.color1);
            if (!col) return;
            if (col.length == 8 && !col.startsWith("#")) col = "#" + col;
            if (col.length != 9) { alert("Input has to be 9 characters long!"); return; }
            banner_style.color1 = col;
        } else if (opt == "6") {
            let col = prompt(`New gradient secondary color: (default: ${DEFAULT_BANNER_STYLE.color2}) [hex color notation, #rrggbbaa]`, banner_style.color2);
            if (!col) return;
            if (col.length == 8 && !col.startsWith("#")) col = "#" + col;
            if (col.length != 9) { alert("Input has to be 9 characters long!"); return; }
            banner_style.color2 = col;
        } else if (opt == "7") {
            const col = confirm("Are you sure to reset the gradient to default settings?");
            if (!col) return;
            banner_style.stop = DEFAULT_BANNER_STYLE.stop;
            banner_style.rotation = DEFAULT_BANNER_STYLE.rotation;
            banner_style.color1 = DEFAULT_BANNER_STYLE.color1;
            banner_style.color2 = DEFAULT_BANNER_STYLE.color2;
        } else return;
        banner.style.backgroundImage = banner_image_style(banner_style);
        localStorage.setItem("banner", JSON.stringify(banner_style));
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
                JSON.parse(style_str) : { ...DEFAULT_ACHIEVEMENT_STYLE };

            c.append(makeBeatenTile(ach, id, style, username));
        }
    }

    banner.append(c);
}

function makeEmptyTile() {
    var wrap = document.createElement("div");
    wrap.style.backgroundColor = "#3232324d";
    wrap.className = "p-1 rounded";
    wrap.addEventListener('click', function(e) {
        e.stopPropagation();
        alert("To place an achievement go to its page and select this slot. (only unlocked achievements) [sometimes the slot options on the achievement page doesnt generate, try to refresh the page in that case]");
    });

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
4-Reset customization settings to default for this slot. 
5-Exit.
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
            const emo = prompt(`Enter the new emoji (default: '${DEFAULT_ACHIEVEMENT_STYLE.emoji}') [any string, type '-' for empty]:`, style.emoji);
            if (emo) {
                change = true;
                style.emoji = (emo != '-') ? emo : null;
            }
        } else if (opt == "3") {
            let col = prompt(`Enter the new background color (default: '${DEFAULT_ACHIEVEMENT_STYLE.backgroundColor}') [hexadecimal color notation, #rrggbbaa]:`, style.backgroundColor);
            if (col && col.length >= 6) {
                if (!col.startsWith("#")) col = "#" + col;
                change = true;
                style.backgroundColor = col;
            }
        } else if (opt == "4") {
            let opt = confirm('Are you sure you want to reset customization to default? (only this slot)');
            if (opt) {
                localStorage.removeItem(data_key + "-Style");
                main();
                return;
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
        "tooltipComponent($el, { dynamicType: 'achievement', dynamicId: '" + achievement.id + "', dynamicContext: '" + username + "'})"
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

    if (style.emoji && style.emoji.length > 0) {
        var emoji = document.createElement("div");
        emoji.className = "pt-1 text-center";
        emoji.innerText = style.emoji;
        wrap.appendChild(emoji);
    }

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

function banner_image_style(style) {
    return `linear-gradient(${style.rotation}deg, ${style.color1} ${style.stop}%, ${style.color2}), url('${style.image}')`;
}
