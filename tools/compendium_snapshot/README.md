# compendium_snapshot

Rust CLI for generating the Slay the Spire 2 card compendium snapshot from a local game install.

By default, generated snapshots are written to `output/compendium/` at the repo root so they stay out of the tracked source tree.

## Data sources

- `SlayTheSpire2.pck`
  - card portrait import metadata
  - localized text resources
- `data_sts2_windows_x86_64/sts2.dll`
  - card model metadata
  - CIL method bodies used to derive vars, keywords, and upgrade deltas

## Usage

```powershell
cargo run --manifest-path tools/compendium_snapshot/Cargo.toml -- --game-root "E:\SteamLibrary\steamapps\common\Slay the Spire 2"
```

Optional:

- `--output <dir>`: override output directory
- `--inspect-class <Name>`: print parsed IL for a specific card class
