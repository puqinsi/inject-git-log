/*
 * @Description: 配置 husky
 * @Author: zhaoce
 * @Developer: zhaoce
 * @Date: 2023-01-07 00:05:35
 * @LastEditTime: 2023-01-07 00:05:35
 */

/* 自动注入 git 信息 */

// const dayjs = require("dayjs");
// const fs = require("fs");
// const { execSync } = require("child_process");
import dayjs from "dayjs";
import * as fs from "fs";
import ChildProcess from "child_process";

const { execSync } = ChildProcess;
const gitMsgList = [
  "Description",
  "Author",
  "Developer",
  "Date",
  "LastEditTime"
];
const delimiterArr = [
  {
    open: "/*",
    close: "*/",
    type: "js"
  },
  {
    open: "<!--",
    close: "-->",
    type: "vue"
  }
];
const msgFilePath = process.argv[2];

function injectGitLog() {
  // merge 操作触发的 commit 不做处理，只处理普通的 commit
  if (msgFilePath === ".git/MERGE_MSG") return;

  const targetFiles = getTargetFiles();
  if (targetFiles.length) {
    console.log("文件处理开始");
    processFiles(targetFiles);

    console.log("文件处理完成");
    // 重新提交（注入 git msg 的代码）
    reCommit();
    // 中断 commit-msg 钩子，取消之前的提交
    process.exit(1);
  } else {
    console.log("没有需要处理的文件");
  }
}

function getTargetFiles() {
  const filesStr = execSync("git diff --cached --stat --name-only", {
    encoding: "utf-8"
  }).trim();
  const files = filesStr.split("\n");
  console.log("改动的文件有：", files);

  // 改动文件包含 js 或 vue 文件时，注入 git msg 并重新提交
  const reg = /^((?!(\(|\)|<|>))\S)*?(\.js|\.vue)$/;
  return files.filter(file => reg.test(file));
}

function reCommit() {
  const msg = fs.readFileSync(msgFilePath, "utf-8").trim();
  execSync("git add .");
  execSync(`git commit -m '${msg}' --no-verify`);
}

function processFiles(files) {
  files.forEach(file => {
    try {
      processFile(file);
    } catch (err) {
      // console.log(err);
    }
  });
}

function processFile(file) {
  console.log(`读取 ${file} 文件`);
  const originContent = fs.readFileSync(file, "utf-8").trim();

  console.log(`修改 ${file} 文件`);
  const currentContent = processFileContent(file, originContent);

  console.log(`写入 ${file} 完成`);
  fs.writeFileSync(file, currentContent);
}

function processFileContent(file, content) {
  const delimiter = delimiterArr.find(item => file.endsWith(`.${item.type}`));

  // 开头有注释
  if (content.startsWith(delimiter.open)) {
    const { annotate, mainContent } = splitFileContent(content, delimiter);
    // 注释是 git 记录
    if (annotate.indexOf(`@${gitMsgList[0]}`) !== -1) content = mainContent;
  }

  const annotate = processAnnotate(file, delimiter);

  return annotate + content;
}

function splitFileContent(content, delimiter) {
  const { open, close } = delimiter;
  const openLength = open.length;
  const closeLength = close.length;

  delimiter.openLength = openLength;
  delimiter.closeLength = closeLength;

  const closeIndex = content.indexOf(close);
  const annotateLen = closeIndex + closeLength;

  const annotate = content.slice(0, annotateLen).trim();
  const mainContent = content.slice(annotateLen).trim();

  return { annotate, mainContent };
}

// 生成文件的 git 记录
function processAnnotate(file, delimiter) {
  const connector = " * ";
  const { open, close, type } = delimiter;
  const gitObj = getGitMessage(file);

  // git 信息格式化处理
  const annotateArr = gitMsgList.map(msg => {
    return `@${msg}: ${gitObj[msg]}\n`;
  });

  return `${open}\n${connector}${annotateArr.join(connector)}${
    type === "vue" ? close : ` ${close}`
  }\n\n`;
}

function getGitMessage(file) {
  const Developer = execSync("git config user.name", {
    encoding: "utf-8"
  }).trim();
  const Description = fs.readFileSync(msgFilePath, "utf-8").trim();
  const LastEditTime = dayjs().format("YYYY-MM-DD HH:mm:ss");

  // 获取初始作者和创建日期
  let Author, Date;
  const firstCommit = execSync(`git log --reverse --oneline ${file}`, {
    encoding: "utf-8"
  }).split(" ")[0];
  if (firstCommit) {
    Author = execSync(`git log ${firstCommit} --pretty=format:%an ${file}`, {
      encoding: "utf-8"
    }).trim();
    const time = execSync(
      `git log ${firstCommit} --pretty=format:%at ${file}`,
      {
        encoding: "utf-8"
      }
    ).trim();
    Date = dayjs(time * 1000).format("YYYY-MM-DD HH:mm:ss");
  } else {
    Author = Developer;
    Date = LastEditTime;
  }

  return {
    Date,
    Author,
    Developer,
    Description,
    LastEditTime
  };
}

injectGitLog();