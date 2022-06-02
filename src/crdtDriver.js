import {v4 as uuidv4} from 'uuid';
import { makeClientId, Clock } from "./clock.js";
import { Timestamp } from "./timestamp.js";
import merkle from './merkle.js';
import { deserializeValue, serializeValue } from './serialize.js';

// TODO: Refactor into smaller files
// TODO: Rename or merge 'sync' and 'deliverMessages'
// TODO: 'setPartner' should be part of 'incoming sync'
// TODO:  Check for client id, else make else ID

/**
 * @param {DB} database_connection: an sql.js database
 * @param {Object} options
 * @param {boolean} options.debug
 * @param {boolean} options.messagesOnly
 * @returns {Object} crdt_driver
 * @returns {function} crdt_driver.insert
 * @returns {function} crdt_driver.update
 * @returns {function} crdt_driver.tombstone
 * @returns {function} crdt_driver.sync
 * @returns {Object} crdt_driver.debug
 * @returns {function} crdt_driver.deliverMessages
 * @returns {function} crdt_driver.setPartner 
 */
export default function crdtDriver(database_connection, options={}) {

  let group = options.group;

  let peers = [];
  

  const db = database_connection;

  function setGroup(setToGroup) {
    group = setToGroup;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages
      (timestamp TEXT,
      group_id TEXT,
      dataset TEXT,
      row TEXT,
      column TEXT,
      value TEXT,
      PRIMARY KEY(timestamp, group_id));

    CREATE TABLE IF NOT EXISTS messages_merkles
      (group_id TEXT PRIMARY KEY,
      merkle TEXT);
  `);

  function listMessages() {
    let database_messages = db.exec("SELECT * FROM messages ORDER BY timestamp;")[0]?.values || [];

    let db_messages = database_messages.map(row => {
      return {
        timestamp: row[0],
        group_id: row[1],
        dataset: row[2],
        row: row[3],
        column: row[4],
        value: deserializeValue(row[5])
      }
    });

    return db_messages;
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
    let res = await fetch('/crdt-sync', {
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
    if (options.messagesOnly) return;
    let tableExist = db.exec(`SELECT * FROM sqlite_schema WHERE type = 'table' AND name = '${msg.dataset}';`).length;
    if (!tableExist) { // Improve this to a query;
      throw new Error('Unknown dataset: ' + msg.dataset);
    }

    UpdateInto(msg.dataset, msg.column, msg.row, msg.value);
  }

  function compareMessages(messages) {
    let existingMessages = new Map();

    let sortedMessages = [...listMessages()].sort((m1, m2) => {
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


      }
    }
    return newMessages;
  }


  function applyMessages(messages) {
    
    let existingMessages = compareMessages(messages);
    
    messages.forEach(msg => {
      let existingMsg = existingMessages.get(msg);

      if (!existingMsg || existingMsg.timestamp < msg.timestamp) {
        apply(msg);
      }

      let resy = queryRun('SELECT * FROM messages WHERE timestamp = ?', [msg.timestamp]);
      if(resy.length > 0) {
        return;
      }

      let res = queryRun(
        `INSERT OR IGNORE INTO messages (timestamp, group_id, dataset, row, column, value) VALUES
           (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [msg.timestamp, group, msg.dataset, msg.row, msg.column, serializeValue(msg.value)]
      );


      clock.merkle = merkle.insert(
        clock.merkle,
        Timestamp.parse(msg.timestamp)
      );
      queryRun(
        'INSERT OR REPLACE INTO messages_merkles (group_id, merkle) VALUES (?, ?)',
        [group, JSON.stringify(clock.merkle)]
      );
  
    });


    return clock.merkle;

  }


  function sendMessages(messages) {
    applyMessages(messages);
    sync(messages, peers);
  }

  function receiveMessages(messages) {
    
    messages.forEach(msg =>
      Timestamp.recv(clock, Timestamp.parse(msg.timestamp))
    );
    
    
    let merkle = applyMessages(messages);

    return merkle; 
  }

  async function deliverMessages(req) {

    let { group_id, client_id, messages, merkle: clientMerkle } = req;
    let trie = receiveMessages(messages);

    let newMessages = messagesSinceLastSync(trie, group_id, client_id, clientMerkle);
    
    return { messages: newMessages, merkle: trie }
  }

  async function sync(messages=[], specified_peers) {
    if(!specified_peers) {
      specified_peers = peers
    }
    specified_peers.forEach(peer => {
      syncWithPeer(messages, peer);
    });
    syncEvent();
  }

  async function syncWithPeer(initialMessages = [], peer, since = null) {

    let messages = initialMessages;

    if (since) {
      let timestamp = new Timestamp(since, 0, '0').toString();
      messages = listMessages().filter(msg => msg.timestamp >= timestamp);
    }

    let result;
    let req = {
          group_id: group,
          client_id: clock.timestamp.node(),
          messages,
          merkle: getMerkle(group)
        };
    try {
      result = await peer.deliverMessages(req);
    } catch (e) {
      throw new Error(`network-failure`);
    }

    if (result.messages.length > 0) {
      receiveMessages(result.messages);
    }

    let diffTime = merkle.diff(result.merkle, getMerkle(group));
  
    if (diffTime) {
      if (since && since === diffTime) {;


        throw new Error(
          'A bug happened while syncing  and the client ' +
            'was unable to get in sync with the server. ' +
            "This is an internal error that shouldn't happen"
        );
      }

      return syncWithPeer([], peer, diffTime);
    }
  }

  function UpdateInto(dataset, column, id, value) {
    
      db.run(`

          INSERT INTO ${dataset} (id, ${column}) VALUES('${id}', '${value}')
              ON CONFLICT(id) DO UPDATE SET ${column}='${value}';
      `);
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

  function tombstone(table, id) {
    sendMessages([
      {
        dataset: table,
        row: id,
        column: 'tombstone',
        value: 1,
        timestamp: Timestamp.send(clock).toString()
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

  function addPeer(peer) {
    peers.push(peer);
  }


  const debug = {
    listMessages,
    db
  };



  function setSyncServer() {
    addPeer({
      node_name: "server",
      deliverMessages: async req => await post(req)
    });
  }



  const clock = new Clock(new Timestamp(0, 0, makeClientId()));
  clock.merkle = getMerkle(group);

  function getNodeId() {
    return clock.timestamp.node();
  }

  function bootstrap(group_id) {
    let allMessages = queryRun(
          `SELECT * FROM messages WHERE group_id = ? ORDER BY timestamp`,
          [group_id]
    );

    let newMessages = allMessages.map(m => {
            return {
                timestamp: m[0],
                group_id: m[1],
                dataset: m[2],
                row: m[3],
                column: m[4],
                value: deserializeValue(m[5])
            }
        });
        return newMessages;
  }

  let syncEvent = () => {}
  function setSyncEvent(proposedEvent) {
    syncEvent = proposedEvent;
  }

  return { 
      insert,
      update,
      tombstone,
      debug: options.debug ? debug : null,
      deliverMessages,
      addPeer,
      setSyncServer, // TODO: Can be extracted
      sync,
      getNodeId,
      bootstrap,
      receiveMessages,
      setGroup, 
      setSyncEvent,
      listMessages
  };


}