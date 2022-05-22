import initSqlJs from 'sql.js';
import {v4 as uuidv4} from 'uuid';
import { makeClientId, Clock } from "./lib/clock";
import { Timestamp } from "./lib/timestamp";
import merkle from './lib/merkle';
import { deserializeValue, serializeValue } from './lib/serialize';




async function InitDatabase() {

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
        locateFile: file => file
    });


    const db = new SQL.Database();


  function dataMessages() {
    let database_messages = db.exec("SELECT * FROM messages;")[0]?.values || [];

    let db_messages = database_messages.map(row => {
      return {
        timestamp: row[0],
        group_id: row[1],
        dataset: row[2],
        row: row[3],
        column: row[4],
        value: row[5]
      }
    });

    return db_messages;
  }


  function addMessages(groupId, messages) {
    let trie = getMerkle(groupId);

    queryRun('BEGIN');

    try {
      for (let message of messages) {
        const { dataset, row, column, value, timestamp } = message;

        let res = queryRun(
          `INSERT OR IGNORE INTO messages (timestamp, group_id, dataset, row, column, value) VALUES
            (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [timestamp, groupId, dataset, row, column, serializeValue(value)]
        );

        // Should probably add this back
        //if (res.changes === 1) {
          // Update the merkle trie
          trie = merkle.insert(trie, Timestamp.parse(message.timestamp));
        //}
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


    return trie;
  }

  function queryRun(sql, params = []) {
    let stmt = db.prepare(sql);
    stmt.bind(params);
    let res = [];
    while(stmt.step()) {
        res.push(stmt.get())
    }
    return res;
  }

  async function post(data) {
    let res = await fetch('http://localhost:8006/sync', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    res = await res.json();

    if (res.status !== 'ok') {
      throw new Error('API error: ' + res.reason);
    }
    return res.data;
  }

  function apply(msg) {
    let tableExist = db.exec(`SELECT * FROM sqlite_schema WHERE type = 'table' AND name = '${msg.dataset}';`).length;
    if (!tableExist) { // Improve this to a query;
      throw new Error('Unknown dataset: ' + msg.dataset);
    }

    UpdateInto(msg.dataset, msg.column, msg.row, msg.value);
  }

  function compareMessages(messages) {
    let existingMessages = new Map();

    // This could be optimized, but keeping it simple for now. Need to
    // find the latest message that exists for the dataset/row/column
    // for each incoming message, so sort it first

    let sortedMessages = [...dataMessages()].sort((m1, m2) => {
      if (m1.timestamp < m2.timestamp) {
        return 1;
      } else if (m1.timestamp > m2.timestamp) {
        return -1;
      }
      return 0;
    });

    messages.forEach(msg1 => {
      let existingMsg = sortedMessages.find(
        msg2 =>
          msg1.dataset === msg2.dataset &&
          msg1.row === msg2.row &&
          msg1.column === msg2.column
      );

      existingMessages.set(msg1, existingMsg);
    });

    return existingMessages;
  }

  function applyMessages(messages) {
    let existingMessages = compareMessages(messages);

    messages.forEach(msg => {
      let existingMsg = existingMessages.get(msg);

      if (!existingMsg || existingMsg.timestamp < msg.timestamp) {
        apply(msg);
      }

      let res = queryRun(
        `INSERT OR IGNORE INTO messages (timestamp, group_id, dataset, row, column, value) VALUES
           (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [msg.timestamp, "my-group", msg.dataset, msg.row, msg.column, serializeValue(msg.value)]
      );


      if (!existingMsg || existingMsg.timestamp !== msg.timestamp) {
        clock.merkle = merkle.insert(
          clock.merkle,
          Timestamp.parse(msg.timestamp)
        );
      }
    });

  }


  function sendMessages(messages) {
    applyMessages(messages);
    sync(messages);
  }

  function receiveMessages(messages) {

    messages.forEach(msg =>
      Timestamp.recv(clock, Timestamp.parse(msg.timestamp))
    );

    applyMessages(messages);
  }

  async function sync(initialMessages = [], since = null) {



    let messages = initialMessages;

    if (since) {
      let timestamp = new Timestamp(since, 0, '0').toString();
      messages = dataMessages().filter(msg => msg.timestamp >= timestamp);
    }

    let result;
    try {
      result = await post({
        group_id: 'my-group',
        client_id: clock.timestamp.node(),
        messages,
        merkle: clock.merkle
      });
    } catch (e) {
      throw new Error('network-failure');
    }

    if (result.messages.length > 0) {
      receiveMessages(result.messages);
    }

    let diffTime = merkle.diff(result.merkle, clock.merkle);

    if (diffTime) {
      if (since && since === diffTime) {
        throw new Error(
          'A bug happened while syncing and the client ' +
            'was unable to get in sync with the server. ' +
            "This is an internal error that shouldn't happen"
        );
      }

      return sync([], diffTime);
    }
  }

  function UpdateInto(dataset, column, id, value) {
    
      db.run(`

          INSERT INTO ${dataset} (id, ${column}) VALUES('${id}', '${value}')
              ON CONFLICT(id) DO UPDATE SET ${column}='${value}';
      `);
  }


  function Tombstone(dataset, id) {
      UpdateInto(dataset, 'tombstone', id, 1);
  }

  function insert(table, row) {
    let id = uuidv4();
    let fields = Object.keys(row);

    sendMessages(
      fields.map(k => {
        return {
          dataset: table,
          row: row.id || id,
          column: k,
          value: row[k],
          timestamp: Timestamp.send(clock).toString()
        };
      })
    );

    return id;
  }

  function update(table, params) {
    let fields = Object.keys(params).filter(k => k !== 'id');

    sendMessages(
      fields.map(k => {
        return {
          dataset: table,
          row: params.id,
          column: k,
          value: params[k],
          timestamp: Timestamp.send(clock).toString()
        };
      })
    );
  }

  function delete_(table, id) {
    sendMessages([
      {
        dataset: table,
        row: id,
        column: 'tombstone',
        value: 1,
        timestamp: Timestamp.send(getClock()).toString()
      }
    ]);
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

    db.run(`
        CREATE TABLE todos
            (
                id text primary key,
                name text,
                type text,
                ordered number,
                tombstone number default 0
            );
        CREATE TABLE users
            (
                id text primary key,
                email text,
                username text,
                password text,
                tombstone integer
            );
        CREATE TABLE habits
            (
                id text primary key ,
                user_id text,
                title text,
                description text,
                mode text,
                target window integer,
                interval integer,
                sleep integer,
                tombstone integer
            );
        CREATE TABLE checkins
            (
                id text primary key,
                habit_id text,
                moment integer,
                description text,
                status text,
                tombstone integer
            );
          CREATE TABLE messages
            (timestamp TEXT,
            group_id TEXT,
            dataset TEXT,
            row TEXT,
            column TEXT,
            value TEXT,
            PRIMARY KEY(timestamp, group_id));

          CREATE TABLE messages_merkles
            (group_id TEXT PRIMARY KEY,
            merkle TEXT);
    `);


  // TODO:  Check for client id, else make else ID
  const clock = new Clock(new Timestamp(0, 0, makeClientId()));
  clock.merkle = getMerkle('my-group');

    return { 
      db,
      insert,
      receiveMessages,
      update,
      sync,
      dataMessages
    };
    
}


export {
    InitDatabase
};
