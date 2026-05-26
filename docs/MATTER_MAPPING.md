# Dreame FP10 Matter mapping

This plugin targets Matter 1.2+ semantics through Matterbridge. Matterbridge
3.7.x currently ships device definitions from Matter 1.4.2, which still includes
the Matter 1.2 air purifier and air quality model.

## Endpoints

| Endpoint | Matter device type | Purpose |
| --- | --- | --- |
| FP10 | Air Purifier `0x002D` | Main purifier control |
| AirQuality child | Air Quality Sensor `0x002C` | Air quality and environmental measurements |
| Mode child | Mode Select | FP10-specific modes not expressible by Fan Control alone |

## Clusters

| FP10 feature | Dreame MiOT | Matter cluster |
| --- | --- | --- |
| Power on / standby | action `2.1`, state `2.1` | On/Off `0x0006` |
| Fan mode and speed | `2.3`, `2.4` | Fan Control `0x0202` |
| Auto / Sleep / Manual / Pet | `2.3` | Mode Select `0x0050` child endpoint |
| HEPA filter condition | `4.1`, `4.2` | HEPA Filter Monitoring `0x0071` |
| Carbon filter condition | `4.5`, `4.6` | Activated Carbon Filter Monitoring `0x0072` |
| Air quality level | `3.4` | Air Quality `0x005B` |
| PM2.5 | `3.5` | PM2.5 Concentration Measurement `0x042A` |
| TVOC | `3.6` | Total VOC Concentration Measurement `0x042B` |
| Temperature | `3.3` | Temperature Measurement `0x0402` |
| Humidity | `3.2` | Relative Humidity Measurement `0x0405` |

LED brightness, LED breathe, sound and child lock are intentionally not exposed
as Matter clusters in this first plugin because they do not map cleanly to
standard Matter 1.2 air purifier functionality.
