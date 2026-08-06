import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "docs");
const output = join(root, ".pages");
const template = await readFile(join(source, "template.html"), "utf8");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;

const languages = {
  en: {
    label: "English",
    alternate: "简体中文",
    alternateCode: "zh-CN",
    project: "Overview",
    deployment: "Server deployment",
    openclaw: "OpenClaw",
    openclawTutorial: "OpenClaw tutorial",
    hermes: "HermesAgent",
    hermesTutorial: "HermesAgent tutorial",
    integrations: "Agent integrations",
    examples: "Examples",
    releases: "Releases",
    articles: "Articles",
    article: "Why Web Search infrastructure"
  },
  "zh-CN": {
    label: "简体中文",
    alternate: "English",
    alternateCode: "en",
    project: "项目概览",
    deployment: "服务端部署",
    openclaw: "OpenClaw 接入",
    openclawTutorial: "OpenClaw 实战",
    hermes: "HermesAgent 接入",
    hermesTutorial: "HermesAgent 实战",
    integrations: "Agent 接入",
    examples: "示例",
    releases: "版本记录",
    articles: "文章目录",
    article: "Agent Web Search 架构"
  }
};

const pages = [
  { slug: "", file: "index.md", label: "project", nav: true, title: { en: "Camofox Web Search", "zh-CN": "Camofox Web Search" } },
  { slug: "deployment", file: "deployment.md", label: "deployment", nav: true, title: { en: "Server deployment", "zh-CN": "服务端部署" } },
  { slug: "examples", file: "examples.md", label: "examples", group: "integrations", title: { en: "Examples", "zh-CN": "示例" } },
  { slug: "openclaw", file: "openclaw.md", label: "openclaw", group: "integrations", title: { en: "OpenClaw installation and usage", "zh-CN": "OpenClaw 安装与使用" } },
  { slug: "hermes", file: "hermes.md", label: "hermes", group: "integrations", title: { en: "HermesAgent installation and usage", "zh-CN": "HermesAgent 安装与使用" } },
  { slug: "releases", file: "releases.md", label: "releases", nav: true, title: { en: "Release notes", "zh-CN": "版本记录" } },
  {
    slug: "articles",
    file: "articles.md",
    label: "articles",
    group: "articles",
    languages: ["zh-CN"],
    title: { "zh-CN": "文章" }
  },
  {
    slug: "articles/openclaw-camofox-web-search-guide",
    source: join(root, "articles", "openclaw-camofox-web-search-guide.md"),
    label: "openclawTutorial",
    group: "articles",
    languages: ["zh-CN"],
    title: { "zh-CN": "给 OpenClaw 装上真正可控的 Web Search" }
  },
  {
    slug: "articles/hermesagent-camofox-web-search-guide",
    source: join(root, "articles", "hermesagent-camofox-web-search-guide.md"),
    label: "hermesTutorial",
    group: "articles",
    languages: ["zh-CN"],
    title: { "zh-CN": "让 HermesAgent 拥有真正可控的 Web Search" }
  },
  {
    slug: "articles/web-search-for-ai-agents",
    source: join(root, "articles", "web-search-for-ai-agents.md"),
    label: "article",
    group: "articles",
    languages: ["zh-CN"],
    title: { "zh-CN": "让 AI Agent 真正看见互联网" }
  }
];

const navigationGroups = {
  integrations: ["examples", "openclaw", "hermes"],
  articles: [
    "articles",
    "articles/web-search-for-ai-agents",
    "articles/openclaw-camofox-web-search-guide",
    "articles/hermesagent-camofox-web-search-guide"
  ]
};

const legacyRedirects = {
  "zh-CN": {
    article: "articles/web-search-for-ai-agents",
    "openclaw-tutorial": "articles/openclaw-camofox-web-search-guide",
    "hermesagent-tutorial": "articles/hermesagent-camofox-web-search-guide"
  }
};

function rootPrefix(slug) {
  return "../".repeat(slug.split("/").filter(Boolean).length + 1);
}

function pageUrl(language, slug, current) {
  return `${rootPrefix(current)}${language}/${slug ? `${slug}/` : ""}`;
}

function pageLink(page, language, current) {
  const label = languages[language][page.label];
  const active = page.slug === current ? " aria-current=\"page\"" : "";
  return `<a href="${pageUrl(language, page.slug, current)}"${active}>${label}</a>`;
}

function navigation(language, current) {
  const labels = languages[language];
  const availablePages = pages.filter((page) => !page.languages || page.languages.includes(language));
  const directLinks = availablePages.filter((page) => page.nav).map((page) => pageLink(page, language, current));
  const groups = Object.entries(navigationGroups).flatMap(([group, slugs]) => {
    const groupPages = slugs
      .map((slug) => availablePages.find((page) => page.slug === slug))
      .filter(Boolean);
    if (groupPages.length === 0) return [];
    const active = groupPages.some((page) => page.slug === current) ? " active" : "";
    const links = groupPages.map((page) => pageLink(page, language, current)).join("");
    return `<details class="nav-group${active}"><summary>${labels[group]}</summary><div class="nav-menu">${links}</div></details>`;
  });
  const alternatePage = pages.find((page) => page.slug === current && (!page.languages || page.languages.includes(labels.alternateCode)));
  const languageLink = `<a class="language-link" href="${pageUrl(labels.alternateCode, alternatePage ? current : "", current)}" data-language="${labels.alternateCode}">${labels.alternate}</a>`;
  return `${directLinks.slice(0, 2).join("")}${groups.join("")}${directLinks.slice(2).join("")}${languageLink}`;
}

function renderTemplate({ language, slug, title, content }) {
  const prefix = rootPrefix(slug);
  const documentTitle = title === "Camofox Web Search" ? title : `${title} · Camofox Web Search`;
  return template
    .replaceAll("{{lang}}", language)
    .replaceAll("{{title}}", title)
    .replaceAll("{{documentTitle}}", documentTitle)
    .replaceAll("{{description}}", language === "zh-CN" ? "自托管的 Web Search 服务端部署与 Agent 接入文档" : "Self-hosted Web Search deployment and Agent integration documentation")
    .replaceAll("{{navigation}}", navigation(language, slug))
    .replaceAll("{{content}}", content)
    .replaceAll("{{root}}", prefix)
    .replaceAll("{{version}}", version);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const language of Object.keys(languages)) {
  for (const page of pages) {
    if (page.languages && !page.languages.includes(language)) continue;
    const markdownPath = page.source ?? join(source, "content", language, page.file);
    let markdown = (await readFile(markdownPath, "utf8")).replaceAll("{{version}}", version);
    const prefix = rootPrefix(page.slug);
    if (page.source) {
      markdown = markdown
        .replaceAll("(./assets/", `(${prefix}articles/assets/`)
        .replaceAll("(../docs/content/zh-CN/deployment.md)", `(${prefix}zh-CN/deployment/)`)
        .replaceAll("(../docs/content/zh-CN/examples.md)", `(${prefix}zh-CN/examples/)`)
        .replaceAll("(../README.zh-CN.md)", "(https://github.com/idefav/web-search/blob/main/README.zh-CN.md)");
    }
    if (page.source) {
      markdown = `<div class="breadcrumbs"><a href="${prefix}${language}/articles/">文章</a><span aria-hidden="true">/</span><span>${page.title[language]}</span></div>\n\n${markdown}`;
    }
    const content = (await marked.parse(markdown, { gfm: true })).replaceAll('href="/', `href="${prefix}`);
    const target = join(output, language, page.slug, "index.html");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, renderTemplate({ language, slug: page.slug, title: page.title[language], content }));
  }
}

for (const [language, redirects] of Object.entries(legacyRedirects)) {
  for (const [from, to] of Object.entries(redirects)) {
    const target = join(output, language, from, "index.html");
    const destination = `../${to}/`;
    const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${destination}"><meta http-equiv="refresh" content="0;url=${destination}"><title>Moved · Camofox Web Search</title></head><body><p><a href="${destination}">This page has moved.</a></p></body></html>`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
}

const rootPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="google-site-verification" content="7oHvCTaYT60c-hWix-xPk2nSU1Y5G6iX-etQgfCYAsI">
<meta name="description" content="Camofox Web Search documentation"><title>Camofox Web Search</title>
<link rel="stylesheet" href="styles.css"></head><body class="language-home">
<main><section class="hero"><p class="eyebrow">SELF-HOSTED · MCP + REST</p><h1>Camofox Web Search</h1>
<p class="lede">Choose a documentation language / 选择文档语言</p>
<div class="language-choices"><a href="zh-CN/" data-language="zh-CN">简体中文</a><a href="en/" data-language="en">English</a></div>
</section></main><script src="app.js"></script></body></html>`;
await writeFile(join(output, "index.html"), rootPage);
await cp(join(source, "styles.css"), join(output, "styles.css"));
await cp(join(source, "app.js"), join(output, "app.js"));
await cp(join(source, "assets"), join(output, "assets"), { recursive: true });
await cp(join(root, "articles", "assets"), join(output, "articles", "assets"), { recursive: true });
await cp(join(root, "examples", "deepagents", "demo.cast"), join(output, "assets", "deepagents-demo.cast"));
await cp(join(root, "node_modules", "asciinema-player", "dist", "bundle", "asciinema-player.css"), join(output, "assets", "asciinema-player.css"));
await cp(join(root, "node_modules", "asciinema-player", "dist", "bundle", "asciinema-player.min.js"), join(output, "assets", "asciinema-player.min.js"));
await writeFile(join(output, ".nojekyll"), "");

process.stdout.write(`Built bilingual documentation for v${version} in ${output}\n`);
