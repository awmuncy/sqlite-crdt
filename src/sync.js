import { setClock, makeClock, makeClientId, getClock } from "./lib/clock";
import { Timestamp } from "./lib/timestamp";
import { db_messages, UpdateInto } from "./database";
import merkle from './lib/merkle';





setClock(makeClock(new Timestamp(0, 0, makeClientId())));

let _onSync = null;
let _syncEnabled = true;

function setSyncingEnabled(flag) {
  _syncEnabled = flag;
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

  let sortedMessages = [...db_messages].sort((m1, m2) => {
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
  let clock = getClock();

  messages.forEach(msg => {
    let existingMsg = existingMessages.get(msg);

    if (!existingMsg || existingMsg.timestamp < msg.timestamp) {
      apply(msg);
    }

    if (!existingMsg || existingMsg.timestamp !== msg.timestamp) {
      clock.merkle = merkle.insert(
        clock.merkle,
        Timestamp.parse(msg.timestamp)
      );
      db_messages.push(msg);
    }
  });

  _onSync && _onSync();
}

function sendMessages(messages) {
  applyMessages(messages);
  // sync(messages);
}

function receiveMessages(messages) {

  messages.forEach(msg =>
    Timestamp.recv(getClock(), Timestamp.parse(msg.timestamp))
  );

  applyMessages(messages);
}

function onSync(func) {
  _onSync = func;
}

async function sync(initialMessages = [], since = null) {
  if (!_syncEnabled) {
    return;
  }

  let messages = initialMessages;

  if (since) {
    let timestamp = new Timestamp(since, 0, '0').toString();
    messages = db_messages.filter(msg => msg.timestamp >= timestamp);
  }

  let result;
  try {
    result = await post({
      group_id: 'my-group',
      client_id: getClock().timestamp.node(),
      messages,
      merkle: getClock().merkle
    });
  } catch (e) {
    throw new Error('network-failure');
  }

  if (result.messages.length > 0) {
    receiveMessages(result.messages);
  }

  let diffTime = merkle.diff(result.merkle, getClock().merkle);

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

export {
  sync,
  sendMessages
}