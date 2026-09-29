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
        console.error('RAF: Article not found?');
        return;
    }

    const achievement_img = article.querySelector('img[src^="https://media.retroachievements.org/Badge/"]');
    if (!achievement_img) {
        console.error('RAF: Badge not found!');
        return;
    }

    if (achievement_img.src.indexOf("_lock") >= 0) {
        console.info('RAF: Achievement is locked!');
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
        console.info('RAF: Slots already generated! Binding onclick listeners...');

        for (const id of ["#RAF-Slot1-Achievement", "#RAF-Slot2-Achievement", "#RAF-Slot3-Achievement"]) {
            const b = container.querySelector(id);
            b.addEventListener('click', selectedAchievement);
        }

    } else {
        console.info('RAF: Slots not found! Generating...');

        const div = article.querySelector("div.gap-4.flex-col.flex");
        if (div) {

            const c = document.createElement('span');
            c.className = 'flex justify-center items-center gap-4';
            c.id = "RAF-Container";

            const t = document.createElement('div');
            t.className = 'text-2xs text-neutral-500 light:text-neutral-600';
            t.innerText = 'RAF: Display this achievement on your profile!';
            t.id = 'RAF-Title';

            c.append(t);

            for (let id = 1; id <= 3; id++) {
                let b = document.createElement('button');
                b.className = "btn-base btn-base--default btn-base--size-sm gap-1.5";
                b.innerText = "Slot " + id;
                b.id = "RAF-Slot" + id + "-Achievement";
                b.addEventListener('click', selectedAchievement);
                c.append(b);
            }

            div.append(c);
        }
    }
}

function getLastUrlSegment(url) {
    return new URL(url).pathname.split('/').filter(Boolean).pop();
}
