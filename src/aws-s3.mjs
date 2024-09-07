#!/usr/bin/env node

import inquirer from "inquirer";
import inquirerCheckboxPlusPrompt from "inquirer-checkbox-plus-prompt";
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import cliProgress from "cli-progress";
import asciiTree from "ascii-tree";
import chalk from "chalk";

// Register the checkbox-plus prompt
inquirer.registerPrompt("checkbox-plus", inquirerCheckboxPlusPrompt);

async function promptForCredentials() {
  const questions = [];

  if (!process.env.AWS_ACCESS_KEY_ID) {
    questions.push({
      type: "input",
      name: "accessKeyId",
      message: "Enter your AWS Access Key ID:",
    });
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    questions.push({
      type: "password",
      name: "secretAccessKey",
      message: "Enter your AWS Secret Access Key:",
    });
  }

  if (!process.env.AWS_REGION) {
    questions.push({
      type: "input",
      name: "region",
      message: "Enter your AWS Region:",
      default: "us-east-1",
    });
  }

  return inquirer.prompt(questions);
}

function createS3Client(credentials, region) {
  return new S3Client({
    credentials,
    region: region,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5000,
      socketTimeout: 5000,
    }),
    maxAttempts: 3,
  });
}

async function listS3Buckets(credentials) {
  const s3Client = createS3Client(credentials, credentials.region);
  const command = new ListBucketsCommand({});

  try {
    const { Buckets } = await s3Client.send(command);
    return Buckets.map((bucket) => ({ ...bucket, Region: credentials.region }));
  } catch (error) {
    console.error("Error listing S3 buckets:", error);
    return [];
  }
}

async function askForPreSelection() {
  const { preSelect } = await inquirer.prompt([
    {
      type: "confirm",
      name: "preSelect",
      message: "Do you want all buckets to be pre-selected?",
      default: false,
    },
  ]);
  return preSelect;
}

async function selectBuckets(buckets) {
  const preSelect = await askForPreSelection();

  const { selectedBuckets } = await inquirer.prompt([
    {
      type: "checkbox-plus",
      name: "selectedBuckets",
      message:
        "Select S3 buckets (use space to select/deselect, type to search):",
      pageSize: process.stdout.rows - 2,
      highlight: true,
      searchable: true,
      source: async (answersSoFar, input) => {
        return buckets
          .filter((bucket) =>
            input
              ? bucket.Name.toLowerCase().includes(input.toLowerCase())
              : true
          )
          .map((bucket) => ({
            name: bucket.Name,
            value: bucket.Name,
          }));
      },
      default: preSelect ? buckets.map((b) => b.Name) : [],
    },
  ]);
  return selectedBuckets;
}

async function askForDownloadPath() {
  const { downloadPath } = await inquirer.prompt([
    {
      type: "input",
      name: "downloadPath",
      message: "Enter the path to download the buckets:",
      default: "./s3_buckets",
    },
  ]);
  return downloadPath;
}

async function verifyAndCreateFolder(folderPath) {
  try {
    await fs.access(folderPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      const { create } = await inquirer.prompt([
        {
          type: "confirm",
          name: "create",
          message: `The folder ${folderPath} doesn't exist. Do you want to create it?`,
          default: true,
        },
      ]);
      if (create) {
        await fs.mkdir(folderPath, { recursive: true });
        console.log(`Folder ${folderPath} created.`);
      } else {
        throw new Error("Download cancelled: folder does not exist");
      }
    } else {
      throw error;
    }
  }
}

async function downloadBuckets(
  credentials,
  selectedBuckets,
  downloadPath,
  bucketsInfo
) {
  for (const bucket of selectedBuckets) {
    console.log(chalk.cyan(`\nDownloading bucket: ${bucket}`));
    const bucketInfo = bucketsInfo.find((b) => b.Name === bucket);

    const regionSpecificClient = createS3Client(credentials, bucketInfo.Region);

    try {
      // Check if the bucket is in the specified region
      await regionSpecificClient.send(
        new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })
      );
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 301) {
        console.log(
          chalk.yellow(
            `Skipping bucket ${bucket} as it's not in the specified region (${bucketInfo.Region}).`
          )
        );
        continue;
      } else {
        console.error(`Error checking bucket ${bucket}:`, error);
        continue;
      }
    }

    const bucketPath = path.join(downloadPath, bucket);
    await fs.mkdir(bucketPath, { recursive: true });

    let totalObjects = 0;
    let totalSize = 0;
    let downloadedObjects = 0;
    let downloadedSize = 0;

    // First, count total objects and calculate total size for this bucket
    const listCommand = new ListObjectsV2Command({ Bucket: bucket });
    let isTruncated = true;
    let continuationToken = undefined;

    while (isTruncated) {
      const { Contents, IsTruncated, NextContinuationToken } =
        await regionSpecificClient.send(listCommand);
      totalObjects += Contents?.length || 0;
      totalSize +=
        Contents?.reduce((acc, obj) => acc + (obj.Size || 0), 0) || 0;
      isTruncated = IsTruncated;
      continuationToken = NextContinuationToken;
      if (continuationToken) {
        listCommand.input.ContinuationToken = continuationToken;
      }
    }

    const progressBar = new cliProgress.SingleBar({
      format: " {bar} | {percentage}% | ({value}/{total})",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });

    progressBar.start(totalObjects, 0);

    // Reset for actual download
    listCommand.input.ContinuationToken = undefined;
    isTruncated = true;
    continuationToken = undefined;

    const treeStructure = [];

    while (isTruncated) {
      const { Contents, IsTruncated, NextContinuationToken } =
        await regionSpecificClient.send(listCommand);

      for (const object of Contents || []) {
        const filePath = object.Key.split("/");
        let currentPath = "";
        for (let i = 0; i < filePath.length; i++) {
          const part = filePath[i];
          currentPath += part;
          if (i < filePath.length - 1 || object.Key.endsWith("/")) {
            currentPath += "/";
            if (!treeStructure.includes(currentPath)) {
              treeStructure.push(currentPath);
            }
          } else {
            treeStructure.push(currentPath);
          }
        }

        if (!object.Key.endsWith("/")) {
          const fullPath = path.join(bucketPath, object.Key);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });

          const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: object.Key,
          });
          const { Body, ContentLength } = await regionSpecificClient.send(
            getCommand
          );
          const writeStream = fsSync.createWriteStream(fullPath);

          await pipeline(Body, writeStream);
          downloadedObjects++;
          downloadedSize += ContentLength;

          progressBar.update(downloadedObjects);
        } else {
          downloadedObjects++;
          progressBar.update(downloadedObjects);
        }
      }

      isTruncated = IsTruncated;
      continuationToken = NextContinuationToken;
      if (continuationToken) {
        listCommand.input.ContinuationToken = continuationToken;
      }
    }

    progressBar.update(totalObjects);
    progressBar.stop();

    console.log(chalk.green("\nBucket structure:"));
    const treeString = treeStructure.sort().join("\n");
    console.log(chalk.yellow(asciiTree.generate(treeString)));
  }

  console.log(chalk.green("All buckets downloaded successfully."));
}

async function main() {
  let envCredentials = {};

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    envCredentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    };
  } else if (process.env.AWS_PROFILE) {
    console.log("Using AWS_PROFILE for credentials.");
  } else {
    console.log(
      "No AWS credentials found in environment variables. Please enter them manually."
    );
  }

  const manualCredentials = await promptForCredentials();

  const credentials = {
    ...envCredentials,
    ...manualCredentials,
  };

  console.log(chalk.cyan(`Listing buckets in region: ${credentials.region}`));
  const buckets = await listS3Buckets(credentials);

  if (buckets.length === 0) {
    console.log(
      chalk.yellow(`No S3 buckets found in region ${credentials.region}.`)
    );
    return;
  }

  const selectedBuckets = await selectBuckets(buckets);

  console.log("\nSelected S3 Buckets:");
  selectedBuckets.forEach((bucket) => {
    console.log(`- ${bucket}`);
  });

  const downloadPath = await askForDownloadPath();
  await verifyAndCreateFolder(downloadPath);

  await downloadBuckets(credentials, selectedBuckets, downloadPath, buckets);
}

main().catch((error) => console.error("An error occurred:", error));
