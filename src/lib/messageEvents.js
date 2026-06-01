import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

const MESSAGE_EVENT = 'new_message';

export function notifyNewMessage(waId) {
  emitter.emit(MESSAGE_EVENT, waId);
}

export function onNewMessage(callback) {
  emitter.on(MESSAGE_EVENT, callback);
  return () => emitter.off(MESSAGE_EVENT, callback);
}
