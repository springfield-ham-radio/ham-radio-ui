# WaveBench

WaveBench is a theory bench inside HamBench. The first experiment is **lumped filter design**: change a cutoff, watch the schematic, equations, Bode plots, and time-domain waveforms update together.

Equations in the sidebar are typeset with [KaTeX](https://katex.org), so transfer functions render as stacked fractions instead of a clipped one-line string.

## Open the page

Use the **WaveBench** tab in the header, after Log.

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

The Bode plots mark `f_c` or `f_0` and the probe. The harmonic table is the transmitter view of the same math: how much 2f, 3f, 4f, and 5f still get through.

## Presets

Presets are starting points, not the only valid designs:

- HF harmonic LPF (30 MHz, 50 Ω)
- AM broadcast HPF (1.8 MHz)
- 2 m and 70 cm preselectors
- SSB audio LPF (3 kHz RC)
- CW audio BPF (700 Hz)

## What this model leaves out

Elements are ideal. There is no winding resistance, self-resonance, PCB stray C, or stop-band zeros of an elliptic filter. A two-pole Butterworth is also only a starting point for a legal HF harmonic filter — real low-pass boxes stack several sections.

Later WaveBench experiments can cover matching networks, transmission lines, antennas, and modulation without changing this page’s job.
