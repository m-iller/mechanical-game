# Changelog

## Unreleased — 3.0.0 (branch `engineering-tool`)

Gear Bench is growing from a drive sandbox into a rough-figures tool for mechanical engineering. Plan and status: `docs/ROADMAP.md`, `docs/PROGRESS.md`.

### Added
- **Electric motor** as a part of its own, with a mechanical characteristic: induction (simplified Kloss formula), DC, stepper, or the quick "set speed" and "set torque" sources. Any motor can switch between these.
- **Black-box machine**: a named consumer with a load law (constant torque, linear, fan law, table) and an efficiency. Any rotating part can also carry a load.
- **Operating point and power flow**: a train settles where the motor's torque meets the loads reduced to its shaft; torque and power at every part come from the power actually passing through it.
- **"Where this number comes from"**: click an underlined figure to see its formula, the numbers put into it and the assumptions.
- **Warnings**: motor stall, overload, a motor that cannot start under its load, an undriven load, undercut below 17 teeth.
- **Layers**: only the active layer takes the pointer, the others are drawn faded and let clicks through. Layers can be named and locked. "Only active layer" is a mode that follows the active layer.
- **Editable side view**: drag a part along x and between layers, pull a shaft by its ends, click a layer's letter to make it active.
- **Kinematic scheme**: the top view draws parts as scheme symbols after GOST 2.770-68 (pitch circles, belt and chain lines, a cross for a part fixed on its shaft, ground hatching). The "Scheme" button switches back to drawn parts.
- Templates "Motor and fan" and "Motor, belt, planetary, chain, conveyor".
- Calculation core without DOM in `src/js/core/` (units, explanations, warnings, energy ports, scene migrations, load characteristics) and tests: `npm test`.

- **Mechanisms from separate links**: frame hinge and guide, crank, connecting rod, rocker, slider, slotted link, sliding block, link with several joints. Kinematic pairs appear when a joint is dropped on a joint or a slider on a guide, and go when the link is pulled away; a pair can be made fixed or removed in the panel. The crank sits on a shaft or has its own motor. Mobility by Chebyshev's formula with warnings for an under- or over-constrained chain. Templates "Slider-crank from links" and "Four-bar linkage".

### Changed
- Scenes are saved in format v3. Scenes from 2.x open and are migrated on load.
- With loads on the bench, torque figures show the real power flow. Without loads the old estimate stays (all motor power taken at the chosen output) and says so in its explanation.
