const languageLinks = document.querySelectorAll("[data-language]");
for (const link of languageLinks) {
  link.addEventListener("click", () => localStorage.setItem("docs-language", link.dataset.language));
}

if (document.body.classList.contains("language-home")) {
  const saved = localStorage.getItem("docs-language");
  const language = saved ?? (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en");
  location.replace(new URL(`${language}/`, location.href));
}

const ownerInput = document.querySelector("#owner");
const repoInput = document.querySelector("#repo");
const domainInput = document.querySelector("#domain");
const versionInput = document.querySelector("#version");
const deployCommand = document.querySelector("#deploy-command");
const agentCommand = document.querySelector("#agent-command");

if (ownerInput && repoInput && location.hostname.endsWith(".github.io")) {
  ownerInput.value = location.hostname.slice(0, -".github.io".length);
  repoInput.value = location.pathname.split("/").filter(Boolean)[0] || "web-search";
}

function renderCommands() {
  if (!ownerInput || !repoInput || !deployCommand || !agentCommand) return;
  const owner = ownerInput.value.trim() || "idefav";
  const repo = repoInput.value.trim() || "web-search";
  const domain = domainInput?.value.trim() ?? "";
  const version = versionInput?.value.trim() || document.body.dataset.releaseVersion || "0.0.3";
  const endpoint = domain ? `https://${domain}` : "http://127.0.0.1:8080";
  const deploymentEnvironment = domain ? `WEB_SEARCH_DOMAIN=${JSON.stringify(domain)} ` : "";
  deployCommand.textContent = [
    `VERSION=${JSON.stringify(version)}`,
    `git clone --branch "v\${VERSION}" --depth 1 https://github.com/${owner}/${repo}.git`,
    `cd ${repo}`,
    `${deploymentEnvironment}WEB_SEARCH_IMAGE="ghcr.io/${owner}/${repo}:\${VERSION}" ./deploy/bootstrap.sh`
  ].join("\n");
  agentCommand.textContent = [
    "export WEB_SEARCH_API_KEY=\"<copy securely from the server .env>\"",
    `camofox-web-search install codex --endpoint ${endpoint} --scope user`,
    `camofox-web-search doctor codex --endpoint ${endpoint} --scope user`
  ].join("\n");
}

for (const input of [ownerInput, repoInput, domainInput, versionInput].filter(Boolean)) input.addEventListener("input", renderCommands);

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copy}`);
    if (!target) return;
    await navigator.clipboard.writeText(target.textContent);
    const previous = button.textContent;
    button.textContent = document.documentElement.lang === "zh-CN" ? "已复制" : "Copied";
    setTimeout(() => { button.textContent = previous; }, 1200);
  });
}

renderCommands();
