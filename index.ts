const core = require("@actions/core");
const github = require("@actions/github");
const YAML = require("yaml");
const minimatch = require("minimatch");
const { readFileSync } = require("fs");

const header =
  "Great PR! Please pay attention to the following items before merging:";
const footer =
  "This is an automatically generated QA checklist based on modified files";

// test
function getChecklistPaths(): Record<string, string[]> {
  const inputFile = core.getInput("input-file");
  const parsedFile = YAML.parse(readFileSync(inputFile, { encoding: "utf8" }));
  return parsedFile.paths;
}

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

  const existingComment = (
    await client.issues.listComments({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number
    })
  ).data.find(comment => comment.body.includes(footer));

  if (applicableChecklistPaths.length > 0) {
    const body = [
      `${header}\n\n`,
      ...applicableChecklistPaths.map(([path, items]) => {
        return [
          `__Files matching \`${path}\`:__\n`,
          ...items.map(item => `- [ ] ${item}\n`),
          "\n"
        ].join("");
      }),
      `\n${footer}`
    ].join("");

    if (existingComment) {
      await client.issues.updateComment({
        owner: issue.owner,
        repo: issue.repo,
        comment_id: existingComment.id,
        body
      });
    } else {
      await client.issues.createComment({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        body
      });
    }
  } else {
    if (existingComment) {
      await client.issues.deleteComment({
        owner: issue.owner,
        repo: issue.repo,
        comment_id: existingComment.id
      });
    }
    console.log("No paths were modified that match checklist paths");
  }
}

run().catch(err => core.setFailed(err.message));
