# ZAlarmClock Card

A custom Lovelace card for Home Assistant that mirrors the ZAlarmClock ESPHome device — live flip clock display, digit-based alarm setter, arm/disarm toggle, and dismiss button.

## Installation

### Via HACS (recommended)

1. In HACS, go to **Frontend** → **⋮** → **Custom repositories**
2. Add your repository URL and select category **Lovelace**
3. Click **Install** on the ZAlarmClock Card entry
4. Reload your browser

HACS will automatically register the resource — no manual resource step needed.

### Manual installation

1. Copy `zalarmclock-card.js` to `/config/www/zalarmclock-card.js` on your Home Assistant instance.

2. Add it as a resource:
   - Go to **Settings → Dashboards → ⋮ (menu) → Resources**
   - Click **Add Resource**
   - URL: `/local/zalarmclock-card.js`
   - Type: **JavaScript module**
   - Save and reload the page

## Adding the card

Edit any dashboard and add a card with:

```yaml
type: custom:zalarmclock-card
```

## Configuration

All options are optional — defaults match the ESPHome entity names out of the box.

| Option | Default | Description |
|---|---|---|
| `title` | `Alarm Clock` | Card heading |
| `alarm_hour_entity` | `number.zalarmclock_alarm_hour` | ESPHome alarm hour number entity |
| `alarm_minute_entity` | `number.zalarmclock_alarm_minute` | ESPHome alarm minute number entity |
| `alarm_switch_entity` | `switch.zalarmclock_alarm_enabled` | ESPHome alarm enable switch |
| `dismiss_entity` | `button.zalarmclock_dismiss_alarm` | ESPHome dismiss button entity |

### Example with custom entity IDs

```yaml
type: custom:zalarmclock-card
title: Bedroom Clock
alarm_hour_entity: number.bedroom_clock_alarm_hour
alarm_minute_entity: number.bedroom_clock_alarm_minute
alarm_switch_entity: switch.bedroom_clock_alarm_enabled
dismiss_entity: button.bedroom_clock_dismiss_alarm
```

## Features

- **Live flip clock** — updates every second with a squish-flip animation
- **Digit alarm setter** — ▲/▼ buttons to set hour and minute; hold for rapid repeat
- **Arm/Disarm toggle** — syncs with the ESPHome switch entity
- **Dismiss button** — fires the ESPHome dismiss button entity
- **Dark theme** — matches the on-device LVGL UI aesthetic

## Requirements

The companion ESPHome YAML (`zalarmclock.yaml`) flashed to a Guition JC3248W535 (or compatible ESP32-S3 board) and integrated with Home Assistant via the ESPHome integration.
