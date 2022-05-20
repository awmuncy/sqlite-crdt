import { Timestamp, MutableTimestamp } from "./timestamp";
import { v4 as uuid } from 'uuid';


class Clock {
  merkle;
  timestamp;

  constructor(timestamp, merkle = {}) {
    this.timestamp = MutableTimestamp.from(timestamp);
    this.merkle = merkle;
  }
}

// function serializeClock(clock) {
//   return JSON.stringify({
//     timestamp: clock.timestamp.toString(),
//     merkle: clock.merkle
//   });
// }

// function deserializeClock(clock) {
//   const data = JSON.parse(clock);
//   return {
//     timestamp: Timestamp.from(Timestamp.parse(data.timestamp)),
//     merkle: data.merkle
//   };
// }

function makeClientId() {
  return uuid()
    .replace(/-/g, '')
    .slice(-16);
}

export {
  Clock,
  makeClientId
};