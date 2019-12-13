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

async function run() {
  if (github.context.payload.action !== "opened" && false) {
    console.log("No issue or pull request was opened, skipping");
    return;
  }

  console.log(JSON.stringify(github.context.payload));
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
  ).map(file => file.filename);

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
    await client.pulls.createComment({
      owner: issue.owner,
      repo: issue.repo,
      pull_number: issue.number,
      body: "Hello world"
    });
  }
}

run().catch(err => core.setFailed(err.message));
