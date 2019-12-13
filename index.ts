const core = require("@actions/core");
const github = require("@actions/github");
const YAML = require("yaml");
const minimatch = require("minimatch");
const { readFileSync } = require("fs");

function getChecklistPaths(): Record<string, string[]> {
  const inputFile = core.getInput("input-file");
  const parsedFile = YAML.parse(readFileSync(inputFile, { encoding: "utf8" }));
  return parsedFile.paths;
}

// hm
async function run() {
  const issue: { owner: string; repo: string; number: number } =
    github.context.issue;

  const ghToken = core.getInput("gh-token");
  const client = new github.GitHub(ghToken);

  const checklistPaths = getChecklistPaths();
  const modifiedPaths: string[] = (
    await client.pulls.listFiles({
      owner: issue.owner,
      repo: issue.repo,
      pull_number: issue.number
    })
  ).data.map(file => file.filename);

  const applicableChecklistPaths = Object.entries(checklistPaths).filter(
    ([key, _]) => {
      for (const modifiedPath of modifiedPaths) {
        if (minimatch(modifiedPath, key)) {
          return true;
        }
      }
      return false;
    }
  );

  if (applicableChecklistPaths.length > 0) {
    const comment = [
      "Great PR! Please pay attention to the following items before merging:\n\n",
      ...applicableChecklistPaths.map(([path, items]) => {
        return [
          `__Files matching \`${path}\`:__\n`,
          ...items.map(item => `- [ ] ${item}\n`),
          "\n"
        ].join("");
      })
    ].join("");
    await client.issues.createComment({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      body: comment
    });
  } else {
    console.log("No paths were modified that match checklist paths");
  }
}

run().catch(err => core.setFailed(err.message));
