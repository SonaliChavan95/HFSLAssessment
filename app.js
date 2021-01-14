const fs = require("fs");
const { makeDb } = require('mysql-async-simple');
const mysql = require("mysql");
const moment = require("moment-timezone");
const fastcsv = require("fast-csv");
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "sonali2395",
  database: "News"
};

// format date as per mysql requirement
function formatDate(date) {
  return moment.tz(date, 'UTC').format('YYYY-MM-DD HH:mm:ss');
}

// convert JSON data into sql format for insert query
function formatData(newsData) {
  // Initialize variables
  const items = newsData.Items, len = items.length;
  let i, j;

  // parse file data
  const insertValues = {
    header: [
      newsData.RIC,
      formatDate(newsData.Start),
      formatDate(newsData.End),
      formatDate(newsData.Created),
      parseInt(newsData.MajorVersion),
      parseInt(newsData.MinorVersion)
    ],
    items: [],
    subject_news: [],
    audience_news: [],
    instances_of_news: []
  }

  // create sql queries for bulk insert into db
  for(i = 0; i < len; i++) {
    insertValues.items.push([
      items[i].guid,
      items[i].data.altId,
      formatDate(items[i].data.firstCreated),
      items[i].data.headline,
      items[i].data.language,
      parseInt(items[i].data.messageType),
      items[i].data.provider,
      items[i].data.pubStatus,
      parseInt(items[i].data.takeSequence),
      parseInt(items[i].data.urgency),
      formatDate(items[i].data.versionCreated),
      items[i].data.mimeType,
      items[i].data.body,
      formatDate(items[i].timestamps[0].timestamp),
      formatDate(items[i].timestamps[1].timestamp),
      formatDate(items[i].timestamps[2].timestamp)
    ]);

    for(j = 0; j < items[i].data.subjects.length; j++){
      insertValues.subject_news.push([items[i].guid, items[i].data.subjects[j]]);
    }

    for(j = 0; j < items[i].data.audiences.length; j++){
      insertValues.audience_news.push([items[i].guid, items[i].data.audiences[j]]);
    }

    for(j = 0; j < items[i].data.instancesOf.length; j++){
      insertValues.instances_of_news.push([items[i].guid, items[i].data.instancesOf[j]]);
    }
  }

  return insertValues;
}

// Perform database operations
async function uploadDb(insertValues) {
  // Make connection with mysql server
  const connection = mysql.createConnection(dbConfig);
  const db = makeDb();
  await db.connect(connection);

  // Queries for creating tables and inserting values into tables
  const queries = {
    create: {
      header: "CREATE TABLE headers (id INT AUTO_INCREMENT PRIMARY KEY, ric VARCHAR(255), start_at DATETIME, end_at DATETIME, created_at DATETIME, major_version int, minor_version int)",
      items: "CREATE TABLE items (guid VARCHAR(255), alt_id VARCHAR(255), first_created DATETIME, headline TEXT, language VARCHAR(255), message_type INT, provider VARCHAR(255), pub_status VARCHAR(255), take_sequence INT, urgency INT, version_created DATETIME, mime_type VARCHAR(255), body TEXT, AMER_timestamp DATETIME, APAC_timestamp DATETIME, EMEA_timestamp DATETIME)",
      subject_news: "CREATE TABLE subject_news (guid VARCHAR(255), code VARCHAR(255))",
      audience_news: "CREATE TABLE audience_news (guid VARCHAR(255), code VARCHAR(255))",
      instances_of_news: "CREATE TABLE instances_of_news (guid VARCHAR(255), code VARCHAR(255))"
    },
    insert: {
      header: "INSERT INTO headers (ric, start_at, end_at, created_at, major_version, minor_version) VALUES (?)",
      items: "INSERT INTO items (guid, alt_id, first_created, headline, language, message_type, provider, pub_status, take_sequence, urgency, version_created, mime_type, body, AMER_timestamp, APAC_timestamp, EMEA_timestamp) VALUES ?",
      subject_news: "INSERT INTO subject_news (guid, code) VALUES ?",
      audience_news: "INSERT INTO audience_news (guid, code) VALUES ?",
      instances_of_news: "INSERT INTO instances_of_news (guid, code) VALUES ?"
    }
  }

  // Perform Database operations
  try {
    // create table into database
    const headers = await db.query(connection, queries.create.header);
    const items1 = await db.query(connection, queries.create.items);
    const subjects = await db.query(connection, queries.create.subject_news);
    const audiences = await db.query(connection, queries.create.audience_news);
    const instances = await db.query(connection, queries.create.instances_of_news);

    // Bulk insert into Database
    await db.query(connection, queries.insert.header, [insertValues.header]);
    await db.query(connection, queries.insert.items, [insertValues.items]);
    await db.query(connection, queries.insert.subject_news, [insertValues.subject_news]);
    await db.query(connection, queries.insert.audience_news, [insertValues.audience_news]);
    await db.query(connection, queries.insert.instances_of_news, [insertValues.instances_of_news]);

  } catch (e) {
      // handle exception
      console.log(e);
  } finally {
      await db.close(connection);
  }
}

// Read and parse text file
async function parseTxtFile(filename) {
  console.log("--------Execute step 1---------");
  try {
    console.log(`Reading file with name ${filename}`);
    var data = fs.readFileSync(filename, 'utf8');
    console.log(`Finish reading file with name ${filename}`);
  } catch(e) {
    console.log("Error occurred while reading the file");
    console.log('Error:', e.stack);
  }

  const newsData = JSON.parse(data);
  await uploadDb(formatData(newsData));
}

// Write output of the SQL query into CSV file
async function writeOutputInCSVFile(data, filename) {
  const ws = fs.createWriteStream(filename);
  const jsonData = JSON.parse(JSON.stringify(data));
  // console.log("jsonData", jsonData)

  // Write output into CSV file
  fastcsv
    .write(jsonData, { headers: true })
    .on("finish", function() {
      console.log(`Output written in ${filename} successfully!`);
    })
    .pipe(ws);
}

// Perform Step 2: fetch observations between provided timestamps for American region
async function fetchObservationsBetweenAMERTimestamp(startTime, endTime) {
  console.log("--------Execute step 2---------");
  // Make connection with mysql server
  const connection = mysql.createConnection(dbConfig);
  const db = makeDb();
  await db.connect(connection);

  let query = `SELECT *
    FROM items
    WHERE CAST(items.AMER_timestamp as time) >= ?
      AND CAST(items.AMER_timestamp as time) < ?`;

  try {
    let data = await db.query(connection, query, [startTime, endTime]);
    await writeOutputInCSVFile(data, "Step2Output.csv");
  } catch (e) {
    // handle exception
    console.log(e);
  } finally {
      await db.close(connection);
  }
}

// Perform Step 3: fetch observations which has provided subject
async function fetchObservationsWithSubject(subject) {
  console.log("--------Execute step 3---------");
  // Make connection with mysql server
  const connection = mysql.createConnection(dbConfig);
  const db = makeDb();
  await db.connect(connection);

  let query = `SELECT *
    FROM items
    WHERE guid in (SELECT guid
      FROM subject_news
      WHERE subject_news.code = ?)`;
  try {
    let data = await db.query(connection, query, [subject]);
    await writeOutputInCSVFile(data, "Step3Output.csv");
  } catch (e) {
    // handle exception
    console.log(e);
  } finally {
    await db.close(connection);
  }
}

async function main() {
  // Step 1
  await parseTxtFile('News.RTRS_CMPNY_AMER.20201020.0214.txt');

  // Step 2
  await fetchObservationsBetweenAMERTimestamp("13:00:00", "13:05:00");

  // Step 3
  await fetchObservationsWithSubject("N2:TRAN");
}

main();
