const initSqlJs = require('sql.js');

function UpdateInto(dataset, column, id, value) {
    db.run(`

        INSERT INTO ${dataset} (id, ${column}) VALUES('${id}', '${value}')
            ON CONFLICT(id) DO UPDATE SET ${column}='${value}';
    `);
}

window.UpdateInto = UpdateInto;

function Tombstone(dataset, id) {
    UpdateInto(dataset, 'tombstone', id, 1);
}

async function main() {

    const SQL = await initSqlJs({
    // Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
    // You can omit locateFile completely when running in node
        locateFile: file => file
    });

    db = new SQL.Database();

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
    
}

main();
