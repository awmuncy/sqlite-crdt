
> :warning: **This README is still in progress**: Pitfalls abound.

# SyncLite

This is inspired, and much ripped off from, James Long's [CRDT Example App](https://github.com/jlongster/crdt-example-app), which he created for a presntation. Read more about it [here](https://archive.jlongster.com/using-crdts-in-the-wild).


## Disclaimers

There are plenty of limitations. For example, to insert, update, or delete rows you can't write raw SQL; you have to use the built in insert, update, and tombstone functions which require an ID.

This library won't keep you safe if you decided to go rogue and write to the underlying database yourself. It also won't remain conflict free if a table's schema has been altered. 

## Installation

`npm install @awmuncy/sqlite-crdt`


```
import SyncLite from '@awmuncy/sqlite-crdt';
import Database from '@jlongster/sql.js'; 

const db = new Database();

const syncdb = new SyncLite(db, {});

```