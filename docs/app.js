const ownerInput = document.querySelector("#owner");
const repoInput = document.querySelector("#repo");
const domainInput = document.querySelector("#domain");
const deployCommand = document.querySelector("#deploy-command");
const agentCommand = document.querySelector("#agent-command");

if (location.hostname.endsWith(".github.io")) {
  ownerInput.value = location.hostname.slice(0, -".github.io".length);
  repoInput.value = location.pathname.split("/").filter(Boolean)[0] || "web-search";
}

function render() {
  const owner = ownerInput.value.trim() || "OWNER";
  const repo = repoInput.value.trim() || "REPO";
  const domain = domainInput.value.trim();
  const endpoint = domain ? `https://${domain}` : "http://127.0.0.1:8080";
  const domainPrefix = domain ? `WEB_SEARCH_DOMAIN=${domain} ` : "";
  deployCommand.textContent = `git clone https://github.com/${owner}/${repo}.git\ncd ${repo}\n${domainPrefix}WEB_SEARCH_IMAGE=ghcr.io/${owner}/${repo}:latest ./deploy/bootstrap.sh`;
  agentCommand.textContent = `export WEB_SEARCH_API_KEY=\"<从服务器 .env 安全复制>\"\ncamofox-web-search install codex --endpoint ${endpoint} --scope user\ncamofox-web-search doctor codex --endpoint ${endpoint} --scope user`;
}

for (const input of [ownerInput, repoInput, domainInput]) input.addEventListener("input", render);
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copy}`);
    await navigator.clipboard.writeText(target.textContent);
    const previous = button.textContent;
    button.textContent = "已复制";
    setTimeout(() => { button.textContent = previous; }, 1200);
  });
}
render();
