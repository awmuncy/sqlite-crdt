import { Timestamp, MutableTimestamp } from "./timestamp";
import { v4 as uuid } from 'uuid';

let _clock = null;

function setClock(clock) {
  _clock = clock;
}
window.getClock = getClock;
function getClock() {
  return _clock;
}

function makeClock(timestamp, merkle = {}) {
  return { timestamp: MutableTimestamp.from(timestamp), merkle };
}

function serializeClock(clock) {
  return JSON.stringify({
    timestamp: clock.timestamp.toString(),
    merkle: clock.merkle
  });
}

function deserializeClock(clock) {
  const data = JSON.parse(clock);
  return {
    timestamp: Timestamp.from(Timestamp.parse(data.timestamp)),
    merkle: data.merkle
  };
}

function makeClientId() {
  return uuid()
    .replace(/-/g, '')
    .slice(-16);
}

export {
  setClock,
  getClock,
  makeClock,
  serializeClock,
  deserializeClock,
  makeClientId
};