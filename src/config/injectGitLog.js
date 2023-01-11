/*
 * @Description: chore: 字符串查找方法修改
 * @Author: zhaoce
 * @Developer: ZhaoCe
 * @Date: 2023-01-07 00:05:35
 * @LastEditTime: 2023-01-11 14:53:12
 */

/* 自动注入 git 信息 */
import dayjs from "dayjs";
import * as fs from "fs";
import ChildProcess from "child_process";

const { execSync } = ChildProcess;
const { argv, exit } = process;
const msgFilePath = argv[2];
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
    exit(1);
  } else {
    console.log("没有需要处理的文件");
  }
}

function getTargetFiles() {
  const filesStr = execSync("git diff --cached --name-only", {
    encoding: "utf-8"
  }).trim();
  const files = filesStr.split("\n");
  console.log("改动的文件有：", files);

  // 改动文件包含 js、ts、vue 文件时，注入 git msg 并重新提交
  const reg = /^((?!(\(|\)|<|>))\S)*?(\.js|\.ts|\.vue)$/;
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
    } catch ({ code, path }) {
      if (path) console.log(`读取 ${file} 文件失败`);
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
    if (annotate.includes(`@${gitMsgList[0]}`)) content = mainContent;
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