const core = require("@actions/core");
import * as github from "@actions/github";
const YAML = require("yaml");
const minimatch = require("minimatch");
const { readFileSync } = require("fs");

const header = core.getInput("comment-header");
const footer = core.getInput("comment-footer")

const minimatchOptions = {
  dot: core.getInput('include-hidden-files') === 'true'
};

function getChecklistPaths(): Record<string, string[]> {
  const inputFile = core.getInput("input-file");
  const parsedFile = YAML.parse(readFileSync(inputFile, { encoding: "utf8" }));
  return parsedFile;
}

function formatItemsForPath(applicableChecklist): string {
  const showPaths = core.getInput("show-paths") === 'true';

  let text = ""
  for (const temp of applicableChecklist) {
    if (showPaths){
      text +=
        `__Files were changed in the following path(s):__\n` +
        `${temp.changedPath.map((path) => `- \`${path}\``).join("\n")}\n`+
        `\n${temp.description}\n` +
        `${temp.items.map((item) => `- [ ] ${item}`).join("\n")}\n\n`;
    } else {
      text +=
        `${temp.description}\n` +
        `${temp.items.map((item) => `- [ ] ${item}`).join("\n")}\n\n`;
      }
    }
  return text;
}

function getMatchingPaths(checklistPaths, modifiedPaths) {
  let applicableChecklistPaths = [];
  for (const [key, value] of Object.entries(checklistPaths)){
    let isApplicable = false
    let changedPath = []
    for (const path in (value as any).paths){
      for (const modifiedPath of modifiedPaths) {
        if (minimatch(modifiedPath, (value as any).paths[path], minimatchOptions)) {
          changedPath.push((value as any).paths[path])
          isApplicable = true
        }
      }
    }
    if (isApplicable) {
      (value as any).changedPath = changedPath
      applicableChecklistPaths.push(value)
    }
  }
  return applicableChecklistPaths;
}

async function run() {
  const context = github.context;
  const { owner, repo } = context.repo;
  const number = (context.payload.issue ?? context.payload.pull_request ?? context.payload).number;

  const ghToken = core.getInput("gh-token");
  const client = github.getOctokit(ghToken);

  const checklistPaths = getChecklistPaths();
  const modifiedPaths: string[] = (
    await client.rest.pulls.listFiles({
      owner: owner,
      repo: repo,
      pull_number: number
    })
  ).data.map(file => file.filename);

  const applicableChecklistPaths = getMatchingPaths(checklistPaths, modifiedPaths);

  const existingComment = (
    await client.rest.issues.listComments({
      owner: owner,
      repo: repo,
      issue_number: number
    })
  ).data.find(comment => comment.body.includes(footer));

  if (applicableChecklistPaths.length > 0) {
    const body = [
      `${header}\n\n`,
      formatItemsForPath(applicableChecklistPaths),
      `\n${footer}`,
    ].join("");

    if (existingComment) {
      await client.rest.issues.updateComment({
        owner: owner,
        repo: repo,
        comment_id: existingComment.id,
        body
      });
    } else {
      await client.rest.issues.createComment({
        owner: owner,
        repo: repo,
        issue_number: number,
        body
      });
    }
  } else {
    if (existingComment) {
      await client.rest.issues.deleteComment({
        owner: owner,
        repo: repo,
        comment_id: existingComment.id
      });
    }
    console.log("No paths were modified that match checklist paths");
  }
}

run().catch(err => core.setFailed(err.message));