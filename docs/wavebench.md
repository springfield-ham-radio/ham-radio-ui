# WaveBench

WaveBench is a theory bench inside HamBench. Two experiments share the page:

- **Filters** — lumped low-pass, high-pass, and band-pass design. Change a cutoff and watch the schematic, equations, Bode plots, and oscilloscope update together.
- **AM / FM** — start from the sine-wave equation, pick a carrier, then write a tone into amplitude and frequency modulation. Waveforms are drawn on the same CRT-style oscilloscope used for the filter time trace.

Equations in the sidebar are typeset with [KaTeX](https://katex.org).

## Open the page

Use the **WaveBench** tab in the header, after Log. Switch experiments with the **Filters** / **AM / FM** pills in the page header.

## Oscilloscope

Time-domain traces use a reusable CRT: 10×8 graticule, phosphor traces, and a `TIME` / volts-per-division readout. Filter lab overlays input and output. AM / FM stacks carrier, tone, AM, and FM as separate channels so the envelope and cycle-bunching stay readable.

The carrier on the AM / FM bench is slowed into the audio–IF range so individual cycles fit the screen. On the air `f_c` is megahertz; the shape is the same.

## AM / FM

The sine every later experiment starts from:

`v(t) = A sin(2π f t + φ)`

Pick `f_c` and `A_c`, then enable AM and/or FM.

- **AM** writes the tone into the carrier’s height: `s_AM(t) = A_c [1 + μ m(t)] sin(2π f_c t)`. μ > 1 overmodulates — the envelope crosses zero.
- **FM** writes the tone into instantaneous frequency: `s_FM(t) = A_c sin(2π f_c t + β sin(2π f_m t))` with `β = Δf / f_m`. Amplitude stays `A_c`.

Readings include AM bandwidth `2 f_m` and Carson’s FM rule of thumb `2(Δf + f_m)`.

Presets:

- Carrier only
- AM 70%
- Overmodulation
- NBFM (β ≈ 2.5)
- AM + FM on the same carrier

A useful lab ratio is `f_c ≥ 10 f_m` so the envelope forms around many carrier cycles.

## Filter types

- **Low-pass** — passes energy below `f_c`. HF transmitter harmonic filters and SSB audio filters are the usual ham uses.
- **High-pass** — passes energy above `f_c`. A 1.8 MHz section is a classic way to knock down AM broadcast before a 160 m or 80 m receiver.
- **Band-pass** — passes a window around `f_0`. Receiver preselectors and CW audio peaks live here.

Low-pass and high-pass can be a first-order **RC** voltage divider or a second-order **LC Butterworth** section equally terminated at `Z₀` (50 Ω for RF). Band-pass is a series **RLC** with the output taken across `R`.

LC plots show **S21** so a matched passband sits at 0 dB. RC and RLC plots show voltage gain `H(jω)`.

## Probe tone

The probe is the signal injected into the circuit. Sweep it with the slider (log frequency) or type a value. **Sine** shows a single phasor; **square** rebuilds the output from odd harmonics so you can see the filter eat them.

Readings at the probe frequency:

- Gain (or S21) in dB
- Phase
- Group delay
- Linear |H|

The Bode plots and oscilloscope share one viewport so they stay on screen. **One chart** is the default: pick Magnitude, Phase, or Time. **All charts** tiles the same area instead of stacking plots into a scroll.

The Bode plots mark `f_c` or `f_0` and the probe. The harmonic table is the transmitter view of the same math: how much 2f, 3f, 4f, and 5f still get through.

## Filter presets

Presets are starting points, not the only valid designs:

- HF harmonic LPF (30 MHz, 50 Ω)
- AM broadcast HPF (1.8 MHz)
- 2 m and 70 cm preselectors
- SSB audio LPF (3 kHz RC)
- CW audio BPF (700 Hz)

## What this model leaves out

Filter elements are ideal. There is no winding resistance, self-resonance, PCB stray C, or stop-band zeros of an elliptic filter. A two-pole Butterworth is also only a starting point for a legal HF harmonic filter — real low-pass boxes stack several sections.

AM and FM here are a single-tone textbook modulator: no speech, no limiter, no Bessel-sideband table.

Later WaveBench experiments can cover matching networks, transmission lines, and antennas without changing this page’s job.
