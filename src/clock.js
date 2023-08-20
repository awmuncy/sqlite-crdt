import { MutableTimestamp } from "./timestamp.js";
import { v4 as uuid } from 'uuid';


class Clock {
  merkle;
  timestamp;

  constructor(timestamp, merkle = {}) {
    this.timestamp = MutableTimestamp.from(timestamp);
    this.merkle = merkle;
  }
}

function makeClientId() {
  return uuid()
    .replace(/-/g, '')
    .slice(-16);
}

export {
  Clock,
  makeClientId
};