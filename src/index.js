import { InitDatabase, insert, db_messages } from "./database";
import { sync, _messages } from './sync';


window.db_messages = db_messages;
window.insert = insert;

async function main() {
    console.log("MAIN");
    window.db = await InitDatabase();
}

main();