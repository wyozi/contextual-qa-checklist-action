const core = require("@actions/core");
import * as github from "@actions/github";
const YAML = require("yaml");
const minimatch = require("minimatch");
const { readFileSync } = require("fs");

const header = core.getInput("comment-header");
const footer = core.getInput("comment-footer");

const minimatchOptions = {
  dot: core.getInput("include-hidden-files") === "true",
};

function getChecklistPaths(): Record<string, string[]> {
  const inputFile = core.getInput("input-file");
  const parsedFile = YAML.parse(readFileSync(inputFile, { encoding: "utf8" }));
  return parsedFile.paths;
}

function formatItemsForPath(previousComment, [path, items]) {
  const showPaths = core.getInput("show-paths") === "true";
  const mergeComment = core.getInput("merge-comment") === "true";

  if (!!previousComment && mergeComment) {
    const existingCheckedItems = previousComment
      .split("\n")
      .filter((line) => line !== "" && line.startsWith("- [x]"))
      .map((line) => line.substring(5).trim());
    const preservedItems = items.filter((item) => {
      return !!existingCheckedItems.find((existingItem) =>
        existingItem.includes(item)
      );
    });
    const newItems = items.filter((item) => {
      return !existingCheckedItems.find((existingItem) =>
        existingItem.includes(item)
      );
    });

    return showPaths
      ? [
          `__Files matching \`${path}\`:__\n`,
          ...preservedItems.map((item) => `- [x] ${item}\n`),
          ...newItems.map((item) => `- [ ] ${item}\n`),
          "\n",
        ].join("")
      : [
          ...preservedItems.map((item) => `- [x] ${item}\n`),
          ...newItems.map((item) => `- [ ] ${item}\n`),
        ].join("");
  }

  return showPaths
    ? [
        `__Files matching \`${path}\`:__\n`,
        ...items.map((item) => `- [ ] ${item}\n`),
        "\n",
      ].join("")
    : [...items.map((item) => `- [ ] ${item}\n`)].join("");
}

async function run() {
  const context = github.context;
  const { owner, repo } = context.repo;
  const number = (
    context.payload.issue ??
    context.payload.pull_request ??
    context.payload
  ).number;

  const ghToken = core.getInput("gh-token");
  const client = github.getOctokit(ghToken);

  const checklistPaths = getChecklistPaths();
  const modifiedPaths: string[] = (
    await client.rest.pulls.listFiles({
      owner: owner,
      repo: repo,
      pull_number: number,
    })
  ).data.map((file) => file.filename);

  const applicableChecklistPaths = Object.entries(checklistPaths).filter(
    ([key, _]) => {
      for (const modifiedPath of modifiedPaths) {
        if (minimatch(modifiedPath, key, minimatchOptions)) {
          return true;
        }
      }
      return false;
    }
  );

  const existingComment = (
    await client.rest.issues.listComments({
      owner: owner,
      repo: repo,
      issue_number: number,
    })
  ).data.find((comment) => comment.body.includes(footer));

  if (applicableChecklistPaths.length > 0) {
    const body = [
      `${header}\n\n`,
      ...applicableChecklistPaths.map(([path, items]) =>
        formatItemsForPath(
          !!existingComment ? existingComment.body : undefined,
          [path, items]
        )
      ),
      `\n${footer}`,
    ].join("");

    if (existingComment) {
      await client.rest.issues.updateComment({
        owner: owner,
        repo: repo,
        comment_id: existingComment.id,
        body,
      });
    } else {
      await client.rest.issues.createComment({
        owner: owner,
        repo: repo,
        issue_number: number,
        body,
      });
    }
  } else {
    if (existingComment) {
      await client.rest.issues.deleteComment({
        owner: owner,
        repo: repo,
        comment_id: existingComment.id,
      });
    }
    console.log("No paths were modified that match checklist paths");
  }
}

run().catch((err) => core.setFailed(err.message));
