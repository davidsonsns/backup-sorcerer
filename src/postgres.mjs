#!/usr/bin/env node

import inquirer from "inquirer";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { URL } from "url";
import ora from "ora";
import pg from "pg";

const execPromise = util.promisify(exec);

async function promptForCredentials() {
  const { useUrl } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useUrl",
      message: "Do you want to use a PostgreSQL connection URL?",
      default: true,
    },
  ]);

  if (useUrl) {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: "Enter the PostgreSQL connection URL:",
        validate: (input) => {
          const urlPattern = /^postgres(ql)?:\/\/.*$/;
          return (
            urlPattern.test(input) ||
            "Please enter a valid PostgreSQL connection URL"
          );
        },
      },
    ]);

    const parsedUrl = new URL(url);
    const normalizedUrl = `${parsedUrl.protocol}//${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.host}${parsedUrl.pathname}`;

    return { url: normalizedUrl, allDatabases: false };
  } else {
    const credentials = await inquirer.prompt([
      {
        type: "input",
        name: "host",
        message: "Enter the PostgreSQL host:",
        default: "localhost",
      },
      {
        type: "input",
        name: "port",
        message: "Enter the PostgreSQL port:",
        default: "5432",
      },
      {
        type: "input",
        name: "user",
        message: "Enter your PostgreSQL username:",
      },
      {
        type: "password",
        name: "password",
        message: "Enter your PostgreSQL password:",
      },
      {
        type: "input",
        name: "database",
        message: "Enter the database name:",
        validate: (input) => input.length > 0 || "Database name is required",
      },
      {
        type: "confirm",
        name: "allDatabases",
        message: "Do you want to dump all databases?",
        default: false,
      },
    ]);

    if (!credentials.allDatabases) {
      const { database } = await inquirer.prompt([
        {
          type: "input",
          name: "database",
          message: "Enter the database name:",
          validate: (input) => input.length > 0 || "Database name is required",
        },
      ]);
      credentials.database = database;
    }

    return credentials;
  }
}

async function listDatabases(client) {
  const query = `
    SELECT d.datname AS name,
           pg_size_pretty(pg_database_size(d.datname)) AS size
    FROM pg_database d
    WHERE d.datistemplate = false
    ORDER BY pg_database_size(d.datname) DESC;
  `;
  const result = await client.query(query);
  return result.rows;
}

async function selectDatabaseOption(databases) {
  const choices = [
    { name: "Dump all databases", value: "all" },
    ...databases.map((db) => ({
      name: `${db.name} (${db.size})`,
      value: db.name,
    })),
  ];

  const { selectedOption } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedOption",
      message: "Select a database to dump or choose to dump all:",
      choices: choices,
    },
  ]);
  return selectedOption;
}

async function createPgClient(credentials) {
  let client;
  if (credentials.url) {
    client = new pg.Client(credentials.url);
  } else {
    client = new pg.Client({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.password,
      database: "postgres", // Connect to default database
    });
  }
  await client.connect();
  return client;
}

async function askForExportPath() {
  const now = new Date();
  const defaultPath = `./postgres/${
    now.toISOString().replace(/[:]/g, "-").split(".")[0]
  }`;
  const { exportPath } = await inquirer.prompt([
    {
      type: "input",
      name: "exportPath",
      message: "Enter the path to export the database dump:",
      default: defaultPath,
    },
  ]);
  return exportPath;
}

async function verifyAndCreateFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    const { create } = await inquirer.prompt([
      {
        type: "confirm",
        name: "create",
        message: `The folder ${folderPath} doesn't exist. Do you want to create it?`,
        default: true,
      },
    ]);
    if (create) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`Folder ${folderPath} created.`);
    } else {
      throw new Error("Export cancelled: folder does not exist");
    }
  }
}

async function askForDumpOptions() {
  const { schemaOnly } = await inquirer.prompt([
    {
      type: "confirm",
      name: "schemaOnly",
      message: "Do you want to dump only the schema (no data)?",
      default: false,
    },
  ]);
  return { schemaOnly };
}

async function getDatabaseSize(credentials, database) {
  let client;
  try {
    if (credentials.url) {
      client = new pg.Client(credentials.url);
    } else {
      client = new pg.Client({
        host: credentials.host,
        port: credentials.port,
        user: credentials.user,
        password: credentials.password,
        database: database,
      });
    }
    await client.connect();
    const result = await client.query(
      "SELECT pg_size_pretty(pg_database_size($1)) as size",
      [database]
    );
    return result.rows[0].size;
  } catch (error) {
    console.error(
      chalk.yellow(`Unable to get database size: ${error.message}`)
    );
    return "Unknown";
  } finally {
    if (client) {
      await client.end();
    }
  }
}

async function listAllDatabases(credentials) {
  let client;
  try {
    if (credentials.url) {
      client = new pg.Client(credentials.url);
    } else {
      client = new pg.Client({
        host: credentials.host,
        port: credentials.port,
        user: credentials.user,
        password: credentials.password,
        database: "postgres", // Connect to default database
      });
    }
    await client.connect();
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false;"
    );
    return result.rows.map((row) => row.datname);
  } catch (error) {
    console.error(chalk.yellow(`Unable to list databases: ${error.message}`));
    return [];
  } finally {
    if (client) {
      await client.end();
    }
  }
}

async function dumpAllDatabases(credentials, exportPath, options) {
  const databases = await listAllDatabases(credentials);
  for (const database of databases) {
    await dumpDatabase(credentials, database, exportPath, options);
  }
}

async function dumpDatabase(credentials, database, exportPath, options) {
  const dumpFileName = `${database}_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.dump`;
  const filePath = path.join(exportPath, dumpFileName);

  let pgDumpCommand;
  const baseOptions = "-Fc -Z1 --no-owner --no-privileges";
  const schemaOnlyOption = options.schemaOnly ? "--schema-only" : "";

  if (credentials.url) {
    pgDumpCommand = `pg_dump "${credentials.url}" ${baseOptions} ${schemaOnlyOption} -f "${filePath}"`;
  } else {
    pgDumpCommand = `PGPASSWORD=${credentials.password} pg_dump -h ${credentials.host} -p ${credentials.port} -U ${credentials.user} -d ${database} ${baseOptions} ${schemaOnlyOption} -f "${filePath}"`;
  }

  const dbSize = await getDatabaseSize(credentials, database);
  const spinner = ora(`Dumping database: ${database} (${dbSize})`).start();

  try {
    const { stderr } = await execPromise(pgDumpCommand);
    if (stderr) console.error(chalk.yellow(stderr));
    spinner.succeed(
      chalk.green(
        `Database ${database} (${dbSize}) dumped successfully to ${filePath}`
      )
    );
  } catch (error) {
    spinner.fail(
      chalk.red(
        `Error dumping database ${database} (${dbSize}): ${error.message}`
      )
    );
    throw error;
  }
}

async function main() {
  let client;
  try {
    const credentials = await promptForCredentials();
    const exportPath = await askForExportPath();
    await verifyAndCreateFolder(exportPath);
    const options = await askForDumpOptions();

    client = await createPgClient(credentials);
    console.log(chalk.cyan("Listing databases..."));
    const databases = await listDatabases(client);

    const selectedOption = await selectDatabaseOption(databases);

    if (selectedOption === "all") {
      for (const db of databases) {
        await dumpDatabase(credentials, db.name, exportPath, options);
      }
    } else {
      await dumpDatabase(credentials, selectedOption, exportPath, options);
    }

    console.log(chalk.green("Database dump(s) completed."));
  } catch (error) {
    console.error(chalk.red("An error occurred:", error));
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
