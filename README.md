# mechanical-game

**Gear Bench** is a sandbox for mechanical drives. Drop parts on a drafting sheet, drag them into mesh, and watch speed, direction, ratio and torque propagate through the train. It runs as a desktop app on Windows and Linux, or as a single HTML file in any browser.

![Gear Bench showing a belt, a chain, a bevel cross-shaft, a worm gear and a rack](docs/screenshot.png)

## Download

Get the latest build from [Releases](https://github.com/m-iller/mechanical-game/releases):

| File | For |
| --- | --- |
| `gear-bench-…-windows-setup.exe` | Windows installer |
| `gear-bench-…-windows-portable.exe` | Windows, no install |
| `gear-bench-…-linux-x86_64.AppImage` | Any Linux distro: `chmod +x`, then run |
| `gear-bench-…-linux-amd64.deb` | Debian, Ubuntu, Kubuntu |
| `gear-bench.html` | Any browser, one self-contained file |

The Windows builds are not code-signed, so SmartScreen shows a warning on first launch. Choose "More info", then "Run anyway".

## Drives

| Part | How it connects | Ratio |
| --- | --- | --- |
| Spur gear | Pitch circles touching on the same layer | z₁ / z₂, direction reverses |
| Planetary stage | Sun couples to the shaft below, carrier to the shaft above, ring meshes on its outer teeth | Depends on the held member: ring, carrier or sun |
| Bevel gear | Two bevels facing each other along one cross-shaft | (z₁ / z₂) × pinion ratios |
| Worm gear | Motor on the worm, or a bevel cross-shaft lined up with the worm axis | starts / z, self-locking |
| Belt and pulleys | "Link belt" between two pulleys on one layer, open or crossed | d₁ / d₂ |
| Friction wheels | Two pulleys touching | d₁ / d₂, direction reverses |
| Chain and sprockets | "Link chain" between two sprockets on one layer | z₁ / z₂ |
| Rack | A spur gear touching the rack's pitch line | π·d of travel per gear turn |

All toothed parts use module 2 mm and a 20° pressure angle. Chain is 8 mm pitch (ISO 05B).

## Controls

- **Drag** a part in the top view. It snaps into mesh, onto a shaft on another layer, or onto a bevel or worm axis.
- **Layers** stack along the shaft. Parts sharing a centre on different layers turn together. Add up to eight.
- **Side view** above the top view shares its x axis. Click there to select, drag to pan.
- **Scroll or pinch** to zoom. Delete removes the selected part. Esc cancels a belt or chain link.
- The train **locks** and turns red when parts overlap, a loop of meshes cannot turn, or something tries to back-drive a worm.

Your bench is saved automatically between sessions.

## Run from source

```sh
npm install
npm start          # desktop app
npm run bundle     # dist/gear-bench.html, one self-contained file
npm run dist       # installers for the current OS, in release/
```

The app is plain HTML, CSS and JavaScript in `src/` with no runtime dependencies. `main.js` is a small Electron shell around it.

## Releasing

Bump `version` in `package.json`, then push a matching tag:

```sh
git tag v1.0.1
git push origin v1.0.1
```

The `Release` workflow builds on Windows and Linux runners and attaches every file to a GitHub release.

## What the model leaves out

This is a kinematic model: rigid parts, exact ratios, no loads.

- No belt slip, chain polygon effect, backlash or efficiency losses.
- Tooth profiles are true involutes, but without undercut or root fillets.
- Bevel and worm teeth are drawn schematically.
- The rack is endless: its teeth scroll while the bar stays between its guides.
- Worm gears always self-lock, whatever the lead angle.

## Licence

MIT. See [LICENSE](LICENSE).
