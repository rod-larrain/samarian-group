// Reads and commits site files through the GitHub API. Every dashboard save is one commit on the branch
// Vercel deploys from, so the site republishes itself and every edit stays in the history.

const repo = () => process.env.GITHUB_REPO || "rod-larrain/samarian-group";
const branch = () => process.env.GITHUB_BRANCH || "main";
export const CONTENT_PATH = "content/site.json";

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${init.method || "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function readContent() {
  const file = await gh(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(branch())}`);
  return { content: JSON.parse(Buffer.from(file.content, "base64").toString("utf8")), sha: file.sha };
}

// files: { path: { text } | { base64 } }, deletes: [path]
export async function commit({ files, deletes = [], message }) {
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch())}`);
  const head = await gh(`/git/commits/${ref.object.sha}`);
  const tree = [], blobs = {};
  for (const [path, f] of Object.entries(files)) {
    const blob = await gh("/git/blobs", {
      method: "POST",
      body: JSON.stringify(f.base64 ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" }),
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    blobs[path] = blob.sha;
  }
  for (const path of deletes) tree.push({ path, mode: "100644", type: "blob", sha: null });
  const newTree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const created = await gh("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [ref.object.sha],
      author: { name: "Samarian dashboard", email: "dashboard@samarian-group.vercel.app" },
    }),
  });
  await gh(`/git/refs/heads/${encodeURIComponent(branch())}`, { method: "PATCH", body: JSON.stringify({ sha: created.sha }) });
  // a file's blob sha is the version readContent reports for it
  return { sha: created.sha, blobs };
}
