import { InitDatabase } from "./database.js";

import { initBackend } from 'absurd-sql/dist/indexeddb-main-thread.js';

function init() {
    let webworker = new Worker(new URL('./index.worker.js', import.meta.url));
    initBackend(webworker);
    // Send information to worker
    webworker.postMessage("Sample message");

    // Listen for messages from the worker
    webworker.addEventListener("message", function(event) {
        // `event.data` contains the value or object sent from the worker
        console.log("Message from worker:", event.data); // ["foo", "bar", "baz"]

    });

    webworker.postMessage({
        type: "sql_query",
        query: "CREATE TABLE IF NOT EXISTS Hello (first text, second text);"
    });
    window.webworker = webworker;

}

init();

window.main = main;
async function main() {
    return await InitDatabase();
}