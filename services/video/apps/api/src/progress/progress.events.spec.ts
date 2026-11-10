import { MAX_QUEUE_LENGTH, queuePressure } from './progress.events';

describe('queuePressure', () => {
  it('ok abaixo de 80%, warn de 80% a 99%, full no teto', () => {
    expect(queuePressure(0).level).toBe('ok');
    expect(queuePressure(MAX_QUEUE_LENGTH * 0.79).level).toBe('ok');
    expect(queuePressure(MAX_QUEUE_LENGTH * 0.8).level).toBe('warn');
    expect(queuePressure(MAX_QUEUE_LENGTH - 1).level).toBe('warn');
    expect(queuePressure(MAX_QUEUE_LENGTH).level).toBe('full');
  });

  it('devolve a razão de ocupação', () => {
    expect(queuePressure(50, 100)).toEqual({ ratio: 0.5, level: 'ok' });
    expect(queuePressure(10, 0).ratio).toBe(0);
  });
});
