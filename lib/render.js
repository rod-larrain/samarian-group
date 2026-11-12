// Builds every page of the site from content/site.json.
// Used by scripts/build.js locally and by api/save.js when the dashboard publishes.

export const SITE_URL = "https://samarian-group.vercel.app";

const NAV = [["about", "About"], ["people", "People"], ["contact", "Contact"]];

const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Escaped text with the last two words held together, so no line ends on a lone word
const text = s => {
  const out = esc(String(s ?? "").trim().replace(/\s+/g, " "));
  return out.split(" ").length > 3 ? out.replace(/ (\S+)$/, "&nbsp;$1") : out;
};

// Blank lines in the dashboard separate paragraphs
const paragraphs = s => String(s ?? "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

export const slugify = s => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "person";

// A unique id per person for the bio dialogs, even if two people share a name
const personIds = people => {
  const seen = {};
  return people.map(p => {
    const base = slugify(p.name);
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? `${base}-${seen[base]}` : base;
  });
};

function head({ root, path, title, description, extra = "" }) {
  const url = `${SITE_URL}/${path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Samarian Group">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Samarian Group">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#050707">
  <link rel="icon" type="image/png" sizes="64x64" href="${root}assets/favicon.png">
  <link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg">
  <link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Jost:wght@300;400&display=swap" rel="stylesheet">
  <script>
    try { if (localStorage.getItem("theme") === "light") document.documentElement.dataset.theme = "light"; } catch (e) {}
    // Arriving through the logo transition: show the logo straight away so it can glide into place
    addEventListener("pagereveal", e => { if (e.viewTransition) document.documentElement.classList.add("vt"); });
  </script>
  <link rel="stylesheet" href="${root}assets/site.css">${extra}
</head>`;
}

function chrome(c, root, current) {
  const links = indent => NAV.map(([slug, name]) =>
    `${indent}<a href="${root}${slug}/"${slug === current ? ' aria-current="page"' : ""}>${name}</a>`).join("\n");
  const email = esc(c.contact.email);
  return `  <div class="scene" aria-hidden="true">
    <div class="sky"></div>
    <div class="horizon-glow"></div>
    <div class="shore"></div>
    <div class="sweep"></div>
    <div class="grain"></div>
    <div class="vignette"></div>
  </div>

  <nav class="nav" aria-label="Main">
    <a class="nav-logo" href="${root || "./"}"><img src="${root}assets/logo.webp" alt="Samarian Group" width="2000" height="221"></a>
    <div class="nav-links">
${links("      ")}
      <button class="theme-toggle" type="button" aria-label="Switch to light mode">
        <svg class="icon-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M3.05 12.95l1.13-1.13M11.82 4.18l1.13-1.13"/></svg>
        <svg class="icon-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 10.2A6 6 0 0 1 5.8 2.4a6 6 0 1 0 7.8 7.8z"/></svg>
      </button>
      <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu">
        <span></span><span></span>
      </button>
    </div>
  </nav>

  <div class="menu" id="menu" inert>
    <nav class="menu-links" aria-label="Menu">
${links("      ")}
    </nav>
    <a class="menu-email" href="mailto:${email}">${email}</a>
  </div>
`;
}

function foot(c, root) {
  const email = esc(c.contact.email);
  return `
  <footer class="footer">
    <a href="mailto:${email}">${email}</a>
    <span>${esc(c.copyright)}</span>
  </footer>

  <script src="${root}assets/site.js"></script>
</body>
</html>
`;
}

function homePage(c) {
  const lead = c.people[0];
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Samarian Group",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/assets/apple-touch-icon.png`,
    image: `${SITE_URL}/assets/og-image.jpg`,
    description: c.seo.home,
    address: { "@type": "PostalAddress", addressLocality: c.contact.office || "New York", addressCountry: "US" },
    ...(lead ? { founder: { "@type": "Person", name: lead.name, jobTitle: lead.role } } : {}),
  };
  const ld = `\n  <script type="application/ld+json">\n${JSON.stringify(org, null, 2).replace(/</g, "\\u003c")}\n  </script>`;
  return head({ root: "", path: "", title: "Samarian Group | Private Family Office, New York", description: c.seo.home, extra: ld }) + `
<body class="home">
${chrome(c, "", null)}

  <main>
    <div class="lockup">
      <h1 class="logo">
        <img src="assets/logo.webp" alt="Samarian" width="2000" height="221">
      </h1>

      <p class="about">
        ${text(c.home.intro)}
        <em>${esc(c.referral)}</em>
      </p>
    </div>
  </main>
` + foot(c, "");
}

function innerPage(c, slug, title, body) {
  const root = "../";
  return head({ root, path: `${slug}/`, title: `${title} | Samarian Group`, description: c.seo[slug] }) + `
<body class="page">
${chrome(c, root, slug)}

  <main>
    <h1 class="visually-hidden">${title}</h1>

${body}
  </main>
` + foot(c, root);
}

function aboutPage(c) {
  const block = items => items.map(s => `
      <h3>${text(s.title)}</h3>
${paragraphs(s.text).map(p => `      <p>${text(p)}</p>`).join("\n")}`).join("\n");
  return innerPage(c, "about", "About", `    <div class="prose">
${paragraphs(c.about.intro).map(p => `      <p>${text(p)}</p>`).join("\n")}
${block(c.about.sections)}

      <h2>${esc(c.about.valuesTitle)}</h2>
${block(c.about.values)}

      <p class="referral">${esc(c.referral)}</p>
    </div>`);
}

function peoplePage(c) {
  const ids = personIds(c.people);
  const cards = c.people.map((p, i) => {
    const id = ids[i], name = esc(p.name), role = esc(p.role), photo = `../${esc(p.photo)}`;
    return `      <li class="person">
        <button type="button" data-bio="bio-${id}">
          <img src="${photo}" alt="" width="596" height="734" loading="lazy">
          <h2>${name}</h2>
          <p class="role">${role}</p>
          <span class="more">Read bio</span>
        </button>
        <dialog class="bio" id="bio-${id}" aria-label="${name}">
          <div class="bio-inner">
            <form method="dialog"><button class="close" aria-label="Close">Close</button></form>
            <img src="${photo}" alt="${name}" width="596" height="734" loading="lazy">
            <div class="bio-text">
              <h2>${name}</h2>
              <p class="role">${role}</p>
${paragraphs(p.bio).map(b => `              <p>${text(b)}</p>`).join("\n")}
            </div>
          </div>
        </dialog>
      </li>`;
  }).join("\n");
  return innerPage(c, "people", "People", `    <ul class="people">
${cards}
    </ul>`);
}

function contactPage(c) {
  const email = esc(c.contact.email);
  return innerPage(c, "contact", "Contact", `    <dl class="contact">
      <div>
        <dt>Email</dt>
        <dd><a href="mailto:${email}">${email}</a></dd>
      </div>
      <div>
        <dt>Office</dt>
        <dd>${esc(c.contact.office)}</dd>
      </div>
    </dl>

    <p class="referral">${esc(c.referral)}</p>`);
}

// Every generated file, keyed by its path in the repository
export function renderSite(c) {
  return {
    "index.html": homePage(c),
    "about/index.html": aboutPage(c),
    "people/index.html": peoplePage(c),
    "contact/index.html": contactPage(c),
  };
}
