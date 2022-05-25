import initSqlJs from 'sql.js';
import crdtDriver from '../lib/crdtDriver.js';


async function InitDatabase() {

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
        locateFile: file => file
    });
    const db = new SQL.Database();

    db.run(`
        CREATE TABLE IF NOT EXISTS todos
            (
                id text primary key,
                name text,
                type text,
                ordered number,
                tombstone number default 0
            );
        CREATE TABLE IF NOT EXISTS users
            (
                id text primary key,
                email text,
                username text,
                password text,
                tombstone integer
            );
        CREATE TABLE IF NOT EXISTS habits
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
        CREATE TABLE  IF NOT EXISTS checkins
            (
                id text primary key,
                habit_id text,
                moment integer,
                description text,
                status text,
                tombstone integer
            );

    `);


  return crdtDriver(db, {debug: true, group: "my-group"});
    
}


export {
    InitDatabase
};
