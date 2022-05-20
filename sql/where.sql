SELECT habits.title, checkins.status, checkins.moment
    FROM habits
    INNER JOIN checkins ON habits.id=checkins.habit_id WHERE checkins.habit_id = "2e5e8748-be5-4b7f-a3dd-cf42b4dcec65";