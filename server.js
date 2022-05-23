import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
// let { Timestamp } = require('./server_lib/timestamp');
// let merkle = require('./server_lib/merkle');
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { Sqlite_CRDT } from './src/database.js';

let db;
let crdt; 
async function main() {

    
    // or if you are in a browser:
    // const initSqlJs = window.initSqlJs;

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
      locateFile: file => file
    });

    try {
      var data = fs.readFileSync('./db.db');
      db = new SQL.Database(data);
    } catch(e) {
        db = new SQL.Database();    
    }
    
    // Create a database
    crdt = await Sqlite_CRDT(db, {messagesOnly:true});

    console.log("SQL is ready");

}

main();



let app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));



function queryRun(sql, params = []) {
  let stmt = db.prepare(sql);
  stmt.bind(params);
  let res = [];
  while(stmt.step()) {
      res.push(stmt.get())
  }
  return res;
}

function serializeValue(value) {
  if (value === null) {
    return '0:';
  } else if (typeof value === 'number') {
    return 'N:' + value;
  } else if (typeof value === 'string') {
    return 'S:' + value;
  }

  throw new Error('Unserializable value type: ' + JSON.stringify(value));
}

function deserializeValue(value) {
  const type = value[0];
  switch (type) {
    case '0':
      return null;
    case 'N':
      return parseFloat(value.slice(2));
    case 'S':
      return value.slice(2);
  }

  throw new Error('Invalid type key for value: ' + value);
}

function getMerkle(group_id) {
  let rows = queryRun('SELECT * FROM messages_merkles WHERE group_id = ?', [
    group_id
  ]);

  if (rows.length > 0) {
    return JSON.parse(rows[0][1]);
  } else {
    // No merkle trie exists yet (first sync of the app), so create a
    // default one.
    return {};
  }
}

function addMessages(groupId, messages) {
  let trie = getMerkle(groupId);

  queryRun('BEGIN');

  try {
    for (let message of messages) {
      const { dataset, row, column, value, timestamp } = message;

      let res = queryRun("SELECT * FROM messages WHERE timestamp = ?", [message.timestamp]);

      queryRun(
        `INSERT OR IGNORE INTO messages (timestamp, group_id, dataset, row, column, value) VALUES
           (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [timestamp, groupId, dataset, row, column, serializeValue(value)]
      );

        
      // Should probably add this back
      if (res.length == 0) {
        // Update the merkle trie
        trie = merkle.insert(trie, Timestamp.parse(message.timestamp));
      }
    }

    queryRun(
      'INSERT OR REPLACE INTO messages_merkles (group_id, merkle) VALUES (?, ?)',
      [groupId, JSON.stringify(trie)]
    );
    queryRun('COMMIT');
  } catch (e) {
    queryRun('ROLLBACK');
    throw e;
  }

  let data = db.export();
const buffer = Buffer.from(data);
fs.writeFileSync("./db.db", buffer);
  return trie;
}

function messagesSinceLastSync(trie, group_id, client_id, clientMerkle) {
  let newMessages = [];
  if (clientMerkle) {
    let diffTime = merkle.diff(trie, clientMerkle);
    if (diffTime) {
      let timestamp = new Timestamp(diffTime, 0, '0').toString();
      newMessages = queryRun(
        `SELECT * FROM messages WHERE group_id = ? AND timestamp > ? AND timestamp NOT LIKE '%' || ? ORDER BY timestamp`,
        [group_id, timestamp, client_id]
      );


      newMessages = newMessages.map(m => {
          return {
              timestamp: m[0],
              group_id: m[1],
              dataset: m[2],
              row: m[3],
              column: m[4],
              value: deserializeValue(m[5])
          }
      });

      newMessages = newMessages.map(msg => ({
        ...msg,
        value: deserializeValue(msg.value)
      }));
    }
  }
  return newMessages;
}

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
app.use(express.static(path.resolve('./')));

app.post('/sync', async (req, res) => {
  let { group_id, client_id, messages, merkle: clientMerkle } = req.body;

  let back = await crdt.incomingSync(req.body);


  let data = db.export();
const buffer = Buffer.from(data);
fs.writeFileSync("./db.db", buffer);


  res.send(
    JSON.stringify({
      status: 'ok',
      data: back
    })
  );
});

app.get('/ping', (req, res) => {
  res.send('ok');
});


app.listen(8006);