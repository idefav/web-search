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
    examples: "Examples",
    releases: "Releases"
  },
  "zh-CN": {
    label: "简体中文",
    alternate: "English",
    alternateCode: "en",
    project: "项目概览",
    deployment: "服务端部署",
    examples: "示例",
    releases: "版本记录"
  }
};

const pages = [
  { slug: "", file: "index.md", title: { en: "Camofox Web Search", "zh-CN": "Camofox Web Search" } },
  { slug: "deployment", file: "deployment.md", title: { en: "Server deployment", "zh-CN": "服务端部署" } },
  { slug: "examples", file: "examples.md", title: { en: "Examples", "zh-CN": "示例" } },
  { slug: "releases", file: "releases.md", title: { en: "Release notes", "zh-CN": "版本记录" } }
];

function pageUrl(language, slug, current) {
  const rootPrefix = current ? "../../" : "../";
  return `${rootPrefix}${language}/${slug ? `${slug}/` : ""}`;
}

function navigation(language, current) {
  const labels = languages[language];
  const links = pages.map((page) => {
    const label = page.slug === "deployment" ? labels.deployment : page.slug === "examples" ? labels.examples : page.slug === "releases" ? labels.releases : labels.project;
    const active = page.slug === current ? " aria-current=\"page\"" : "";
    return `<a href="${pageUrl(language, page.slug, current)}"${active}>${label}</a>`;
  }).join("");
  return `${links}<a class="language-link" href="${pageUrl(labels.alternateCode, current, current)}" data-language="${labels.alternateCode}">${labels.alternate}</a>`;
}

function renderTemplate({ language, slug, title, content }) {
  const rootPrefix = slug ? "../../" : "../";
  const documentTitle = title === "Camofox Web Search" ? title : `${title} · Camofox Web Search`;
  return template
    .replaceAll("{{lang}}", language)
    .replaceAll("{{title}}", title)
    .replaceAll("{{documentTitle}}", documentTitle)
    .replaceAll("{{description}}", language === "zh-CN" ? "自托管的 Web Search 服务端部署与 Agent 接入文档" : "Self-hosted Web Search deployment and Agent integration documentation")
    .replaceAll("{{navigation}}", navigation(language, slug))
    .replaceAll("{{content}}", content)
    .replaceAll("{{root}}", rootPrefix)
    .replaceAll("{{version}}", version);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const language of Object.keys(languages)) {
  for (const page of pages) {
    const markdownPath = join(source, "content", language, page.file);
    const markdown = (await readFile(markdownPath, "utf8")).replaceAll("{{version}}", version);
    const rootPrefix = page.slug ? "../../" : "../";
    const content = (await marked.parse(markdown, { gfm: true })).replaceAll('href="/', `href="${rootPrefix}`);
    const target = join(output, language, page.slug, "index.html");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, renderTemplate({ language, slug: page.slug, title: page.title[language], content }));
  }
}

const rootPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
await writeFile(join(output, ".nojekyll"), "");

process.stdout.write(`Built bilingual documentation for v${version} in ${output}\n`);
