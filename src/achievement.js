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
    const article = document.querySelector('article');
    if (!article) {
        log('Article not found?');
        return;
    }

    const achievement_img = article.querySelector('img[src^="https://media.retroachievements.org/Badge/"]');
    if (!achievement_img) {
        log('Badge not found!');
        return;
    }

    if (achievement_img.src.indexOf("_lock") >= 0) {
        log('Achievement is locked!');
        return;
    }

    const achievement_id = getLastUrlSegment(window.location.href)

    const game_li = article.querySelector('a[href^="https://retroachievements.org/game/"]');
    const game_id = getLastUrlSegment(game_li.href)

    const type_svg = article.querySelector('div.flex.flex-col.gap-3 div.flex.flex-col.gap-2 svg');
    const hardcore = type_svg.parentElement.classList.contains('text-[gold]');

    function selectedAchievement(button, _ev) {
        var selected_slot = button.target.id;

        let p = `Do you want to select this achievement for ${selected_slot} ?`

        const data_str = localStorage.getItem(selected_slot);
        if (data_str && data_str.length > 0) {
            const data = JSON.parse(data_str);

            if (data['id'] !== undefined && data['id'] !== null && data['id'].length > 0) {
                p = `${selected_slot} is currently used by '${data.title}'. Are you sure to overwrite with this achievement ?`
            }

        }

        if (confirm(p)) {
            let d = {
                id: achievement_id,
                game: game_id,
                img_src: achievement_img.src,
                title: achievement_img.alt,
                is_hardcore: hardcore,
            };
            localStorage.setItem(selected_slot, JSON.stringify(d));
            button.target.innerText = "OK!"
        }
    }

    const container = article.querySelector("#RAF-Container");
    if (container) {
        log('Slots already generated! Binding onclick listeners...');

        const b1 = container.querySelector("#RAF-Slot1");
        b1.addEventListener('click', selectedAchievement);
        const b2 = container.querySelector("#RAF-Slot2");
        b2.addEventListener('click', selectedAchievement);
        const b3 = container.querySelector("#RAF-Slot3");
        b3.addEventListener('click', selectedAchievement);

    } else {
        log('Slots not found! Generating...');

        const div = article.querySelector("div.gap-4.flex-col.flex");
        if (div) {

            const c = document.createElement('span');
            c.className = 'flex justify-center items-center gap-4';
            c.id = "RAF-Container";

            const t = document.createElement('div');
            t.className = 'text-2xs text-neutral-500 light:text-neutral-600';
            t.innerText = 'RAF: Display this achievement on your profile!';
            t.id = 'RAF-Title';

            // retroachievements button class names
            const button_class_names = "btn-base btn-base--default btn-base--size-sm gap-1.5";

            const b1 = document.createElement('button');
            b1.innerText = "Slot 1";
            b1.id = "RAF-Slot1-Achievement";
            b1.className = button_class_names;
            b1.addEventListener('click', selectedAchievement);

            const b2 = document.createElement('button');
            b2.innerText = "Slot 2";
            b2.id = "RAF-Slot2-Achievement";
            b2.className = button_class_names;
            b2.addEventListener('click', selectedAchievement);

            const b3 = document.createElement('button');
            b3.innerText = "Slot 3";
            b3.id = "RAF-Slot3-Achievement";
            b3.className = button_class_names;
            b3.addEventListener('click', selectedAchievement);

            c.append(t, b1, b2, b3);
            div.append(c);
        }
    }
}

function getLastUrlSegment(url) {
    return new URL(url).pathname.split('/').filter(Boolean).pop();
}

function log(text) {
    console.info(`RAF: ${text}`);
}
