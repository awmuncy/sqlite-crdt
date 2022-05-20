let _messages = [];
let _data = {
  todos: [],
  todoTypes: [],
  todoTypeMapping: []
};

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