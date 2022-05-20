import initSqlJs from 'sql.js';
import { sendMessages } from './sync';
import {v4 as uuidv4} from 'uuid';
import { getClock  } from './lib/clock';
import { Timestamp } from './lib/timestamp';
let db_messages = [];
window.db_messages = db_messages;


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
        timestamp: Timestamp.send(getClock()).toString()
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
        timestamp: Timestamp.send(getClock()).toString()
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

async function InitDatabase() {

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
        locateFile: file => file
    });

    const db = new SQL.Database();

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
                email text unique,
                username text unique,
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
    `);



    return db;
    
}


export {
    UpdateInto,
    Tombstone,
    InitDatabase,
    db_messages,
    insert
};
