function nested() {
    let habits = [];
    let resy = db.exec(`
    SELECT habits.title, checkins.status, checkins.moment
    FROM habits
    INNER JOIN checkins ON habits.id=checkins.habit_id;
    `);
    resy[0].values.forEach((row) => {
        let prunedRow = row.slice();
        prunedRow.shift();
        let index = habits.findIndex(habit => habit.name==row[0]);
        if(index === -1) {
            
            habits.push({
                name: row[0],
                rows: [prunedRow]
            });
        } else {
            habits[index].rows.push(prunedRow);
        }
    });
    return habits;
}