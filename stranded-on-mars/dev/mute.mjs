// Keep test browsers silent: the game's sounds would otherwise play through the Mac's speakers.
// Chrome gets --mute-audio; every browser (incl. WebKit) gets a page script that routes Web Audio into a
// silent gain node (so the audio graph still runs normally) and turns off speech.
export const MUTE_ARGS = ['--mute-audio'];

export async function mutePage(page) {
    await page.addInitScript(() => {
        const AC = window.BaseAudioContext || window.AudioContext || window.webkitAudioContext;
        const d = AC && Object.getOwnPropertyDescriptor(AC.prototype, 'destination');
        if (d && d.get) {
            Object.defineProperty(AC.prototype, 'destination', {
                configurable: true,
                get() {
                    if (!this.__mute) {
                        this.__mute = this.createGain();
                        this.__mute.gain.value = 0;
                        this.__mute.connect(d.get.call(this));
                    }
                    return this.__mute;
                },
            });
        }
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    });
}
