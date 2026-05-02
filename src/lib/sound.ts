"use client";

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const Context =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!Context) {
    return null;
  }

  if (!audioContext) {
    audioContext = new Context();
  }

  return audioContext;
}

export async function playIncomingMessageSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const startAt = context.currentTime + 0.01;
  const notes = [
    { frequency: 740, duration: 0.08, offset: 0 },
    { frequency: 988, duration: 0.12, offset: 0.1 },
  ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, startAt + note.offset);

    gainNode.gain.setValueAtTime(0.0001, startAt + note.offset);
    gainNode.gain.exponentialRampToValueAtTime(0.06, startAt + note.offset + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + note.offset + note.duration,
    );

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startAt + note.offset);
    oscillator.stop(startAt + note.offset + note.duration + 0.03);
  }
}

/**
 * Play a gentle 3-tone ascending chime when a patient joins the waiting room.
 * Distinct from the chat message sound — slightly longer and more "arrival-like".
 */
export async function playPatientWaitingSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const startAt = context.currentTime + 0.01;
  const notes = [
    { frequency: 523, duration: 0.1, offset: 0 },      // C5
    { frequency: 659, duration: 0.1, offset: 0.12 },    // E5
    { frequency: 784, duration: 0.15, offset: 0.24 },   // G5
  ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, startAt + note.offset);

    gainNode.gain.setValueAtTime(0.0001, startAt + note.offset);
    gainNode.gain.exponentialRampToValueAtTime(0.07, startAt + note.offset + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + note.offset + note.duration,
    );

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startAt + note.offset);
    oscillator.stop(startAt + note.offset + note.duration + 0.03);
  }
}
