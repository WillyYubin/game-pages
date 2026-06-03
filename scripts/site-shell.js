(function () {
    const path = (window.location.pathname || "").replace(/\\/g, "/").toLowerCase();

    function detectPrefix() {
        if (path.includes("/fangdai/post/")) {
            return "../../";
        }
        if (path.includes("/pages/") || path.includes("/fangdai/")) {
            return "../";
        }
        return "";
    }

    function normalizePathname(value) {
        return value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
    }

    function ensureShellMarkup(prefix) {
        let toggle = document.getElementById("sideToggle");
        let drawer = document.getElementById("sideDrawer");
        let close = document.getElementById("sideClose");
        let backdrop = document.getElementById("drawerBackdrop");

        if (!toggle || !drawer || !backdrop) {
            const shell = document.createElement("div");
            shell.innerHTML = [
                '<button id="sideToggle" class="side-toggle" type="button" aria-controls="sideDrawer" aria-expanded="false">模块</button>',
                '<aside id="sideDrawer" class="side-drawer" aria-label="模块导航">',
                '  <div class="drawer-head">',
                '    <h2>功能模块</h2>',
                '    <button id="sideClose" class="drawer-close" type="button" aria-label="关闭侧边栏">×</button>',
                '  </div>',
                '  <nav class="drawer-nav">',
                `    <a class="drawer-link" href="${prefix}index.html" data-route="index.html">小熊主页</a>`,
                `    <a class="drawer-link" href="${prefix}pages/castle-defense.html" data-route="pages/castle-defense.html">守城砸怪</a>`,
                `    <a class="drawer-link" href="${prefix}pages/minesweeper.html" data-route="pages/minesweeper.html">扫雷小游戏</a>`,
                `    <a class="drawer-link" href="${prefix}pages/spider-solitaire.html" data-route="pages/spider-solitaire.html">蜘蛛纸牌</a>`,
                `    <a class="drawer-link" href="${prefix}fangdai/fangdai.html" data-route="fangdai/fangdai.html">房贷计算</a>`,
                '  </nav>',
                '</aside>',
                '<div id="drawerBackdrop" class="drawer-backdrop" aria-hidden="true"></div>'
            ].join("");
            document.body.insertBefore(shell, document.body.firstChild);
            toggle = document.getElementById("sideToggle");
            drawer = document.getElementById("sideDrawer");
            close = document.getElementById("sideClose");
            backdrop = document.getElementById("drawerBackdrop");
        } else {
            close = document.getElementById("sideClose");
        }

        return { toggle, drawer, close, backdrop };
    }

    function ensureSparkBackground() {
        if (document.querySelector(".spark")) {
            return;
        }
        ["spark-a", "spark-b", "spark-c"].forEach((name) => {
            const div = document.createElement("div");
            div.className = `spark ${name}`;
            document.body.insertBefore(div, document.body.firstChild);
        });
    }

    function markCurrentLink(drawer) {
        const currentPath = normalizePathname(path || "/index.html");
        const links = drawer.querySelectorAll(".drawer-link");
        links.forEach((link) => {
            link.classList.remove("current");
            const href = link.getAttribute("href");
            if (!href) {
                return;
            }
            const resolvedPath = normalizePathname(new URL(href, window.location.href).pathname);
            const isIndex = currentPath === "" || currentPath === "/";
            if (resolvedPath === currentPath || (isIndex && resolvedPath.endsWith("/index.html"))) {
                link.classList.add("current");
            }
        });
    }

    function bindDrawer(shell) {
        const { toggle, drawer, close, backdrop } = shell;
        if (!toggle || !drawer || !backdrop) {
            return;
        }

        function setDrawerOpen(isOpen) {
            drawer.classList.toggle("open", isOpen);
            backdrop.classList.toggle("open", isOpen);
            toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }

        toggle.addEventListener("click", () => {
            const next = !drawer.classList.contains("open");
            setDrawerOpen(next);
        }, { passive: true });

        if (close) {
            close.addEventListener("click", () => setDrawerOpen(false), { passive: true });
        }

        backdrop.addEventListener("click", () => setDrawerOpen(false), { passive: true });

        drawer.addEventListener("click", (event) => {
            if (event.target.closest("a")) {
                setDrawerOpen(false);
            }
        });

        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                setDrawerOpen(false);
            }
        });
    }

    document.body.classList.add("site-shell-theme");
    ensureSparkBackground();
    const prefix = detectPrefix();
    const shell = ensureShellMarkup(prefix);
    markCurrentLink(shell.drawer);
    bindDrawer(shell);
})();
