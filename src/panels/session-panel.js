/** @typedef {{title: string}} QueueItem */
/** @typedef {{startBtn: HTMLButtonElement; reattachBtn: HTMLButtonElement; skipBtn: HTMLButtonElement; stopBtn: HTMLButtonElement; playbackStatus: HTMLParagraphElement; queueList: HTMLUListElement;}} SessionPanelElements */

export class SessionPanel {
  /** @type {SessionPanelElements} */
  #el;
  /** @param {SessionPanelElements} el */
  constructor(el) {
    this.#el = el;
  }

  /**
   * @param {{ onStart: () => void; onReattach: () => void; onSkip: () => void; onStop: () => void }} handlers
   */
  bind(handlers) {
    this.#el.startBtn.addEventListener('click', handlers.onStart);
    this.#el.reattachBtn.addEventListener('click', handlers.onReattach);
    this.#el.skipBtn.addEventListener('click', handlers.onSkip);
    this.#el.stopBtn.addEventListener('click', handlers.onStop);
  }

  /** @param {'inactive' | 'active' | 'detached'} activationState */
  renderControls(activationState) {
    const isInactive = activationState === 'inactive';
    const isActive = activationState === 'active';
    const isDetached = activationState === 'detached';

    this.#el.startBtn.disabled = !isInactive;
    this.#el.skipBtn.disabled = !isActive;
    this.#el.stopBtn.disabled = isInactive;
    this.#el.reattachBtn.hidden = !isDetached;
    this.#el.reattachBtn.disabled = !isDetached;
  }

  /** @param {string} message */
  renderPlaybackStatus(message) {
    this.#el.playbackStatus.textContent = message;
  }

  /**
   * @param {{activationState: 'inactive' | 'active' | 'detached'; queue: QueueItem[]; index: number}} session
   */
  renderQueue(session) {
    this.#el.queueList.innerHTML = '';
    if (session.activationState === 'inactive' || session.queue.length === 0) return;

    for (let i = 0; i < session.queue.length; i += 1) {
      const item = session.queue[i];
      const li = document.createElement('li');
      if (i === session.index) {
        li.classList.add('current');
      }
      const marker = i === session.index ? '▶' : '•';
      li.textContent = `${marker} ${i + 1}. ${item.title}`;
      this.#el.queueList.appendChild(li);
    }
  }
}
