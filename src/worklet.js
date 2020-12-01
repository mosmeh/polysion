let params = {};

class MoogFilter {
    constructor() {
        this.cutoff = 1;
        this.resonance = 0;
        this._in1 = this._in2 = this._in3 = this._in4 = 0;
        this._out1 = this._out2 = this._out3 = this._out4 = 0;
    }
    get value() {
        return this._out4;
    }
    process(x) {
        const f = Math.max(this.cutoff, 0.1) * (44100 / sampleRate) * 1.16;
        const fb = 4 * this.resonance * (1.0 - 0.15 * f * f);
        x -= this._out4 * fb;
        x *= 0.35013 * (f * f) * (f * f);
        this._out1 = x + 0.3 * this._in1 + (1 - f) * this._out1;
        this._in1 = x;
        this._out2 = this._out1 + 0.3 * this._in2 + (1 - f) * this._out2;
        this._in2 = this._out1;
        this._out3 = this._out2 + 0.3 * this._in3 + (1 - f) * this._out3;
        this._in3 = this._out2;
        this._out4 = this._out3 + 0.3 * this._in4 + (1 - f) * this._out4;
        this._in4 = this._out3;
        return this._out4;
    }
}

const EPS = 1e-4;

class Envelope {
    constructor() {
        this._value = 0;
        this._state = 'idle';
        this._samples = 0;
        this._attack = this._decay = this._release = 0;
        this._sustain = 1;
        this._attackRate = this._decayRate = Infinity;
    }

    setADSR(attack, decay, sustain, release) {
        this._attack = attack * sampleRate;
        this._decay = Math.E * decay * sampleRate;
        this._sustain = sustain;
        this._release = Math.E * release * sampleRate;

        this._attackRate = 1 / Math.max(EPS, this._attack);
        this._decayRate = calcExpRate(1, this._sustain, this._decay);
    }

    noteOn() {
        this._state = 'attack';
        this._value = 0;
    }

    noteOff() {
        switch (this._state) {
            case 'idle':
            case 'attack':
            case 'decay':
            case 'sustain':
                this._state = 'release';
                this._releaseRate = calcExpRate(this._value, 0, this._release);
                this._samples = 0;
                break;
        }
    }

    get value() {
        return this._value;
    }

    get active() {
        return this._state !== 'finished';
    }

    process() {
        switch (this._state) {
            case 'attack':
                this._value += this._attackRate;
                if (this._samples++ >= this._attack) {
                    this._value = 1;
                    this._state = this._sustain === 1 ? 'sustain' : 'decay';
                    this._samples = 0;
                }
                break;
            case 'decay':
                this._value *= this._decayRate;
                if (this._samples++ >= this._decay) {
                    this._value = this._sustain;
                    this._state = 'sustain';
                    this._samples = 0;
                }
                break;
            case 'release':
                this._value *= this._releaseRate;
                if (this._samples++ >= this._release) {
                    this._value = 0;
                    this._state = 'finished';
                }
                break;
        }

        return this._value;
    }
}

function calcExpRate(start, end, samples) {
    return Math.exp(
        (Math.log(Math.max(EPS, end)) - Math.log(Math.max(EPS, start))) /
            samples
    );
}

class Voice {
    constructor(note, panRight) {
        this.note = note;
        this.down = true;

        this._phase1 = Math.random();
        this._phase2 = Math.random();

        this._panRight = panRight;

        this._filter = new MoogFilter();
        this._ampEnv = new Envelope();
        this._filterEnv = new Envelope();

        this.updateParams();

        this._ampEnv.noteOn();
        this._filterEnv.noteOn();
    }

    noteOff() {
        this._ampEnv.noteOff();
        this._filterEnv.noteOff();
    }

    get active() {
        return this._ampEnv.active;
    }

    updateParams() {
        const pan = (this._panRight ? 1 : -1) * params.panSpread;
        const x = ((pan + 1) / 2) * (Math.PI / 2);
        this._gainL = Math.cos(x);
        this._gainR = Math.sin(x);

        this._ampEnv.setADSR(
            convertTime(params.ampEnvAttack),
            convertTime(params.ampEnvDecay),
            params.ampEnvSustain,
            convertTime(params.ampEnvRelease)
        );
        this._filterEnv.setADSR(
            convertTime(params.filterEnvAttack),
            convertTime(params.filterEnvDecay),
            params.filterEnvSustain,
            convertTime(params.filterEnvRelease)
        );

        const freq1 = mtof(this.note + params.oscAPitch);
        this._delta1 = freq1 / sampleRate;

        const freq2 = mtof(this.note + params.oscBPitch + params.detune / 200);
        this._delta2 = freq2 / sampleRate;
    }

    render() {
        const oscA = saw(this._phase1, this._delta1) * params.oscALevel;
        this._phase1 += this._delta1;
        if (this._phase1 >= 1) {
            this._phase1 -= 1;
        }

        const oscB = saw(this._phase2, this._delta2) * params.oscBLevel;
        this._phase2 += this._delta2;
        if (this._phase2 >= 1) {
            this._phase2 -= 1;
        }

        let noise = 2 * Math.random() - 1;
        noise *= params.noise;

        const cutoff =
            params.filterCutoff +
            params.filterEnvAmount * this._filterEnv.process();
        this._filter.cutoff = Math.min(1, cutoff);
        this._filter.resonance = params.filterResonance;

        const y = this._filter.process(
            this._ampEnv.process() * ((oscA + oscB + noise) / 3)
        );

        return [this._gainL * y, this._gainR * y];
    }
}

function mtof(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function saw(phase, dt) {
    return 2 * phase - 1 - polyBlep(phase, dt);
}

function polyBlep(t, dt) {
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1;
    } else if (t > 1 - dt) {
        t = (t - 1) / dt;
        return t * t + t + t + 1;
    }
    return 0;
}

function convertTime(x) {
    return Math.max(0.001, 13 * x ** 3);
}

class Processor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._voices = [];
        this._sustain = false;
        this._panRight = false;

        this.port.onmessage = (msg) => {
            const { data } = msg;
            switch (data.type) {
                case 'params':
                    params = data.params;
                    while (this._voices.length > params.voices) {
                        this._voices.shift();
                    }
                    this._voices.forEach((voice) => voice.updateParams());
                    break;
                case 'noteOn':
                    this._voices.push(new Voice(data.note, this._panRight));
                    this._panRight = !this._panRight;
                    while (this._voices.length > params.voices) {
                        this._voices.shift();
                    }
                    break;
                case 'noteOff':
                    this._voices.forEach((voice) => {
                        if (voice.note === data.note && voice.down) {
                            voice.down = false;
                            if (!this._sustain) {
                                voice.noteOff();
                            }
                        }
                    });
                    break;
                case 'sustain':
                    this._sustain = data.down;
                    if (!data.down) {
                        this._voices.forEach((voice) => {
                            if (!voice.down) {
                                voice.noteOff();
                            }
                        });
                    }
                    break;
            }
        };
    }

    process(_, outputs) {
        const outL = outputs[0][0];
        const outR = outputs[0][1];

        for (let i = 0; i < outL.length; ++i) {
            [outL[i], outR[i]] = this._voices.reduce(
                ([sl, sr], voice) => {
                    const [l, r] = voice.render();
                    return [sl + l, sr + r];
                },
                [0, 0]
            );
        }

        this._voices = this._voices.filter((voice) => voice.active);

        return true;
    }
}

registerProcessor('main', Processor);
