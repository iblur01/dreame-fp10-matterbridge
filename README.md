# Matterbridge Dreame FP10

Matterbridge plugin for the Dreame FP10 / Furcatch Air Purifier FP10.

The plugin exposes the purifier with Matter 1.2+ semantics:

- Air Purifier endpoint with On/Off, Fan Control, HEPA filter monitoring and
  activated carbon filter monitoring.
- Air Quality Sensor child endpoint with Air Quality, PM2.5, TVOC, temperature
  and humidity clusters.
- Mode Select child endpoint for FP10 modes: Auto, Sleep, Manual and Pet.
- Cloud polling through the Dreame MiOT `sendCommand` path.
- Matter writes map back to the purifier:
  - On/Off commands call the FP10 power action.
  - Fan speed writes force FP10 manual mode and set speed 1-10.
  - Fan Mode maps Auto/Low/Medium/High/On to FP10 modes where possible.
  - Mode Select writes switch Auto/Sleep/Manual/Pet directly.

## Development

Matterbridge plugins must not bundle their own `matterbridge` dependency. Use a
linked Matterbridge checkout for development:

```bash
git clone --depth 1 --single-branch --no-tags https://github.com/Luligu/matterbridge.git
cd matterbridge
npm install --no-fund --no-audit
npm run build
npm link --no-fund --no-audit
```

Then in this plugin folder:

```bash
npm install --no-fund --no-audit
npm run dev:link
npm run build
npm run matterbridge:add
```

## Configuration

| Key | Required | Default | Description |
| --- | --- | --- | --- |
| `username` | yes | | Dreame account email or phone |
| `password` | yes | | Dreame account password |
| `country` | no | `eu` | Dreame region: `eu`, `us`, `cn`, `sg`, `kr` |
| `did` | no | | FP10 device id, useful when more than one purifier is present |
| `pollingInterval` | no | `10000` | Polling interval in milliseconds |
| `debug` | no | `false` | Verbose logging |

See [docs/MATTER_MAPPING.md](docs/MATTER_MAPPING.md) for the Matter cluster map.
