import * as Tone from 'tone';
import './style.css';
import { Synth } from './synth';

const keys = {};
document.querySelectorAll('.key').forEach((key) => {
    keys[+key.dataset.note] = key;
});

function highlightKey(note) {
    note = +note;
    if (note in keys) {
        const key = keys[note];
        key.classList.add('pressed');
    }
}

function unhighlightKey(note) {
    note = +note;
    if (note in keys) {
        const key = keys[note];
        key.classList.remove('pressed');
    }
}

async function setupSynth() {
    await Tone.start();

    const synth = new Synth();
    await synth.setup();

    [
        ['volume', 'volume'],
        ['chorus-depth', 'chorusDepth'],
    ].forEach(([id, prop]) => {
        const slider = document.getElementById(id);
        synth[prop] = slider.value;
        slider.addEventListener('input', (e) => {
            synth[prop] = e.target.value;
        });
    });

    const chorusOn = document.getElementById('chorus-on');
    synth.chorusEnabled = chorusOn.checked;
    chorusOn.addEventListener('input', (e) => {
        synth.chorusEnabled = e.target.checked;
    });

    const params = {};
    [
        ['voices', 'voices'],
        ['osc-a-pitch', 'oscAPitch'],
        ['osc-b-pitch', 'oscBPitch'],
        ['detune', 'detune'],
        ['osc-a-level', 'oscALevel'],
        ['osc-b-level', 'oscBLevel'],
        ['noise', 'noise'],
        ['filter-cutoff', 'filterCutoff'],
        ['filter-resonance', 'filterResonance'],
        ['filter-env-amount', 'filterEnvAmount'],
        ['amp-env-attack', 'ampEnvAttack'],
        ['amp-env-decay', 'ampEnvDecay'],
        ['amp-env-sustain', 'ampEnvSustain'],
        ['amp-env-release', 'ampEnvRelease'],
        ['filter-env-attack', 'filterEnvAttack'],
        ['filter-env-decay', 'filterEnvDecay'],
        ['filter-env-sustain', 'filterEnvSustain'],
        ['filter-env-release', 'filterEnvRelease'],
        ['pan-spread', 'panSpread'],
    ].forEach(([id, param]) => {
        const slider = document.getElementById(id);
        slider.addEventListener('input', () => {
            params[param] = +slider.value;
            synth.setWorkletParams(params);
        });
        params[param] = +slider.value;
    });
    synth.setWorkletParams(params);

    function noteOnMidi(note) {
        synth.noteOn(+note);
        highlightKey(+note - 12 * +octave.value);
    }
    function noteOffMidi(note) {
        synth.noteOff(+note);
        unhighlightKey(+note - 12 * +octave.value);
    }

    const octave = document.getElementById('octave');
    function noteOnScreen(note) {
        synth.noteOn(+note + 12 * +octave.value);
        highlightKey(+note);
    }
    function noteOffScreen(note) {
        synth.noteOff(+note + 12 * +octave.value);
        unhighlightKey(+note);
    }

    for (const [note, key] of Object.entries(keys)) {
        function onMouseDown(e) {
            e.preventDefault();
            noteOnScreen(note);
        }
        key.addEventListener('mousedown', onMouseDown);
        key.addEventListener('mouseenter', (e) => {
            if (e.buttons) {
                onMouseDown(e);
            }
        });
        key.addEventListener('touchstart', (e) => {
            const touches = e.targetTouches;
            if (touches.length > 0) {
                e.preventDefault();
                noteOnScreen(note);
            }
        });

        function onMouseUp(e) {
            e.preventDefault();
            noteOffScreen(note);
        }
        key.addEventListener('mouseup', onMouseUp);
        key.addEventListener('mouseleave', (e) => {
            if (e.buttons) {
                onMouseUp(e);
            }
        });
        key.addEventListener('touchend', onMouseUp);
    }

    // prettier-ignore
    const KEYS = [
        'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG',
        'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL'
    ];
    document.addEventListener('keydown', (e) => {
        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
            return;
        }

        switch (e.code) {
            case 'KeyZ':
                octave.value = Math.max(+octave.value - 1, +octave.min);
                return;
            case 'KeyX':
                octave.value = Math.min(+octave.value + 1, +octave.max);
                return;
        }

        const i = KEYS.indexOf(e.code);
        if (i !== -1) {
            e.preventDefault();
            noteOnScreen(i + 60);
        }
    });
    document.addEventListener('keyup', (e) => {
        const i = KEYS.indexOf(e.code);
        if (i !== -1) {
            e.preventDefault();
            noteOffScreen(i + 60);
        }
    });

    function onMidiMessage(e) {
        switch (e.data[0] & 0xf0) {
            case 0x90:
                if (e.data[2] > 0) {
                    noteOnMidi(e.data[1]);
                } else {
                    noteOffMidi(e.data[1]);
                }
                break;
            case 0x80:
                noteOffMidi(e.data[1]);
                break;
            case 0xb0:
                if (e.data[1] === 64) {
                    synth.sustain(e.data[2] >= 64);
                }
                break;
        }
    }

    if (typeof navigator.requestMIDIAccess === 'function') {
        navigator.requestMIDIAccess().then((access) => {
            let inputs;
            if (typeof access.inputs === 'function') {
                inputs = access.inputs();
            } else {
                inputs = access.inputs.values();
            }
            for (const i of inputs) {
                i.onmidimessage = onMidiMessage;
            }
        });
    }
}

setupSynth();

function resume() {
    Tone.start();
}

document.addEventListener('mousedown', resume);
document.addEventListener('keydown', resume);
