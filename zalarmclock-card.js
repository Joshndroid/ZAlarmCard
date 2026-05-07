// ═══════════════════════════════════════════════════════════
//  ZAlarmClock — Custom Lovelace Card
//
//  Installation:
//    1. Copy this file to /config/www/zalarmclock-card.js
//    2. In HA go to Settings → Dashboards → ⋮ → Resources
//       Add resource:  /local/zalarmclock-card.js  (type: JS module)
//    3. Add card to dashboard:
//         type: custom:zalarmclock-card
//
//  Optional config (entity IDs shown are the defaults):
//    type: custom:zalarmclock-card
//    title: Alarm Clock
//    alarm_hour_entity:   number.zalarmclock_alarm_hour
//    alarm_minute_entity: number.zalarmclock_alarm_minute
//    alarm_switch_entity: switch.zalarmclock_alarm_enabled
//    dismiss_entity:      button.zalarmclock_dismiss_alarm
//    reboot_entity:       button.zalarmclock_reboot_device
//    safe_mode_entity:    button.zalarmclock_boot_safe_mode
// ═══════════════════════════════════════════════════════════

class ZAlarmClockCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass        = null;
    this._config      = null;
    this._clockTimer  = null;
    this._prevHour    = null;
    this._prevMinute  = null;
    this._rendered    = false;
    this._alarmHour   = null;
    this._alarmMinute = null;
    this._dirty       = false;
    this._syncing     = false;
  }

  // ── Lovelace lifecycle ─────────────────────────────────

  setConfig(config) {
    this._config = {
      title:               config.title               ?? 'Alarm Clock',
      alarm_hour_entity:   config.alarm_hour_entity   ?? 'number.zalarmclock_alarm_hour',
      alarm_minute_entity: config.alarm_minute_entity ?? 'number.zalarmclock_alarm_minute',
      alarm_switch_entity: config.alarm_switch_entity ?? 'switch.zalarmclock_alarm_enabled',
      dismiss_entity:      config.dismiss_entity      ?? 'button.zalarmclock_dismiss_alarm',
      reboot_entity:       config.reboot_entity       ?? 'button.zalarmclock_reboot_device',
      safe_mode_entity:    config.safe_mode_entity    ?? 'button.zalarmclock_boot_safe_mode',
    };
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) this._syncAlarm();
  }

  connectedCallback()    { this._startClock(); }
  disconnectedCallback() { clearInterval(this._clockTimer); }
  getCardSize()          { return 7; }

  // ── Build DOM ──────────────────────────────────────────

  _build() {
    this.shadowRoot.innerHTML = `<style>${CSS}</style>${HTML(this._config.title)}`;
    this._bindButtons();
    this._rendered = true;
    this._startClock();
    if (this._hass) this._syncAlarm();
  }

  // ── Clock tick ─────────────────────────────────────────

  _startClock() {
    clearInterval(this._clockTimer);
    this._tick();
    this._clockTimer = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    const root = this.shadowRoot;
    const now  = new Date();
    const h    = pad(now.getHours());
    const m    = pad(now.getMinutes());
    const s    = pad(now.getSeconds());

    const secEl = root.querySelector('#sec');
    if (secEl) secEl.textContent = s;

    if (h !== this._prevHour)   { this._prevHour   = h; this._flip(root.querySelector('#hour-panel'), h); }
    if (m !== this._prevMinute) { this._prevMinute = m; this._flip(root.querySelector('#min-panel'),  m); }
  }

  // Squish-flip animation — panel dims to zero height then snaps back
  _flip(panel, value) {
    if (!panel) return;
    const digit = panel.querySelector('.digit');
    if (panel.classList.contains('flipping')) return;
    panel.classList.add('flipping');
    setTimeout(() => { digit.textContent = value; }, 130);
    setTimeout(() => { panel.classList.remove('flipping'); }, 260);
  }

  // ── Sync alarm controls from HA ────────────────────────

  _syncAlarm() {
    const root  = this.shadowRoot;
    const hass  = this._hass;
    const cfg   = this._config;

    const hourSt   = hass.states[cfg.alarm_hour_entity];
    const minSt    = hass.states[cfg.alarm_minute_entity];
    const switchSt = hass.states[cfg.alarm_switch_entity];

    if (hourSt && !this._dirty && !this._syncing) {
      this._alarmHour = clampInt(hourSt.state, 0, 23, 7);
    }
    if (minSt && !this._dirty && !this._syncing) {
      this._alarmMinute = clampInt(minSt.state, 0, 59, 0);
    }
    this._updateAlarmDigits();

    if (switchSt) {
      const isOn  = switchSt.state === 'on';
      if (!this._dirty && !this._syncing) {
        const tog = root.querySelector('#alarm-toggle');
        if (tog) tog.checked = isOn;
      }
      this._updateAlarmState(isOn);
    }
  }

  _updateAlarmDigits() {
    const root = this.shadowRoot;
    const hourEl = root.querySelector('#alarm-hour');
    const minEl = root.querySelector('#alarm-min');
    if (hourEl && this._alarmHour != null) {
      hourEl.textContent = pad(this._alarmHour);
      hourEl.classList.toggle('pending', this._dirty || this._syncing);
    }
    if (minEl && this._alarmMinute != null) {
      minEl.textContent = pad(this._alarmMinute);
      minEl.classList.toggle('pending', this._dirty || this._syncing);
    }
  }

  _updateAlarmState(haIsOn = false) {
    const root = this.shadowRoot;
    const tog = root.querySelector('#alarm-toggle');
    const badge = root.querySelector('#alarm-badge');
    if (this._dirty) {
      if (tog) tog.checked = false;
      if (badge) { badge.textContent = 'OFF'; badge.className = 'badge off'; }
      return;
    }
    if (this._syncing) {
      if (tog) tog.checked = true;
      if (badge) { badge.textContent = 'SYNC'; badge.className = 'badge sync'; }
      return;
    }
    if (badge) {
      badge.textContent = haIsOn ? 'ARMED' : 'OFF';
      badge.className = `badge ${haIsOn ? 'armed' : 'off'}`;
    }
  }

  // ── Service calls ──────────────────────────────────────

  _svc(domain, service, entity_id, extra = {}) {
    return this._hass?.callService(domain, service, { entity_id, ...extra });
  }

  _adjustHour(d) {
    if (this._alarmHour == null) {
      const st = this._hass?.states[this._config.alarm_hour_entity];
      this._alarmHour = clampInt(st?.state, 0, 23, 7);
    }
    this._alarmHour = wrap(this._alarmHour + d, 24);
    this._markDirty();
  }

  _adjustMinute(d) {
    if (this._alarmMinute == null) {
      const st = this._hass?.states[this._config.alarm_minute_entity];
      this._alarmMinute = clampInt(st?.state, 0, 59, 0);
    }
    this._alarmMinute = wrap(this._alarmMinute + d, 60);
    this._markDirty();
  }

  _markDirty() {
    this._dirty = true;
    this._syncing = false;
    this._updateAlarmDigits();
    this._updateAlarmState(false);
  }

  async _commitAndEnable() {
    if (this._alarmHour == null || this._alarmMinute == null) return;
    this._dirty = false;
    this._syncing = true;
    this._updateAlarmDigits();
    this._updateAlarmState(false);
    try {
      await this._svc('number', 'set_value', this._config.alarm_hour_entity,
                      { value: Number(this._alarmHour) });
      await this._svc('number', 'set_value', this._config.alarm_minute_entity,
                      { value: Number(this._alarmMinute) });
      await this._svc('switch', 'turn_on', this._config.alarm_switch_entity);
    } catch (err) {
      console.error('ZAlarmClock: failed to sync alarm', err);
      this._dirty = true;
    } finally {
      this._syncing = false;
      this._updateAlarmDigits();
      this._syncAlarm();
    }
  }

  // ── Button binding (with hold-to-repeat) ──────────────

  _bindButtons() {
    const r = this.shadowRoot;

    this._pressRepeat(r.querySelector('#h-up'), () => this._adjustHour(1));
    this._pressRepeat(r.querySelector('#h-dn'), () => this._adjustHour(-1));
    this._pressRepeat(r.querySelector('#m-up'), () => this._adjustMinute(1));
    this._pressRepeat(r.querySelector('#m-dn'), () => this._adjustMinute(-1));

    r.querySelector('#alarm-toggle').addEventListener('change', async (e) => {
      const checked = e.target.checked;
      try {
        if (checked) {
          await this._commitAndEnable();
        } else {
          this._dirty = false;
          this._syncing = false;
          await this._svc('switch', 'turn_off', this._config.alarm_switch_entity);
        }
      } catch (err) {
        console.error('ZAlarmClock: failed to toggle alarm', err);
        const st = this._hass?.states[this._config.alarm_switch_entity];
        e.target.checked = st?.state === 'on';
      }
      this._syncAlarm();
    });

    r.querySelector('#dismiss').addEventListener('click', () =>
      this._svc('button', 'press', this._config.dismiss_entity));

    this._confirmBtn(r.querySelector('#reboot'),    this._config.reboot_entity,    '↺ REBOOT');
    this._confirmBtn(r.querySelector('#safe-mode'), this._config.safe_mode_entity, '⛨ SAFE MODE');
  }

  // Two-tap confirmation: first tap shows "CONFIRM?" for 2 s,
  // second tap within that window actually calls the service.
  _confirmBtn(el, entityId, label) {
    if (!el) return;
    let timer = null;
    el.addEventListener('click', () => {
      if (el.dataset.confirming === 'true') {
        clearTimeout(timer);
        el.dataset.confirming = 'false';
        el.textContent = label;
        el.classList.remove('confirming');
        this._svc('button', 'press', entityId);
      } else {
        el.dataset.confirming = 'true';
        el.textContent = 'CONFIRM?';
        el.classList.add('confirming');
        timer = setTimeout(() => {
          el.dataset.confirming = 'false';
          el.textContent = label;
          el.classList.remove('confirming');
        }, 2000);
      }
    });
  }

  // Tap = single step. Hold 500ms = rapid repeat every 150ms.
  _pressRepeat(el, fn) {
    if (!el) return;
    let holdTimer = null;
    let repeatTimer = null;

    const start = (e) => {
      e.preventDefault();
      fn();
      holdTimer = setTimeout(() => {
        repeatTimer = setInterval(fn, 150);
      }, 500);
    };
    const stop = () => {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
    };

    el.addEventListener('mousedown',  start);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('mouseup',    stop);
    el.addEventListener('mouseleave', stop);
    el.addEventListener('touchend',   stop);
    el.addEventListener('touchcancel',stop);
  }
}

// ── Helpers ───────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const wrap = (n, max) => ((n % max) + max) % max;
const clampInt = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

// ── HTML template ─────────────────────────────────────────

const HTML = (title) => `
<ha-card>
<div class="card">

  <div class="card-title">${title}</div>

  <!-- ── Current time ── -->
  <div class="time-row">
    <div class="flip-panel" id="hour-panel">
      <div class="upper"></div>
      <div class="fold"></div>
      <div class="digit">--</div>
    </div>
    <div class="time-colon">:</div>
    <div class="flip-panel" id="min-panel">
      <div class="upper"></div>
      <div class="fold"></div>
      <div class="digit">--</div>
    </div>
  </div>

  <div class="sec-row">
    <span id="sec">--</span><span class="sec-lbl">&thinsp;SEC</span>
  </div>

  <div class="divider"></div>

  <!-- ── Alarm setter ── -->
  <div class="alarm-header">
    <span class="alarm-lbl">ALARM</span>
    <span class="badge off" id="alarm-badge">OFF</span>
  </div>

  <div class="setter-row">
    <div class="setter">
      <button class="adj" id="h-up">▲</button>
      <div class="alarm-digit" id="alarm-hour">--</div>
      <button class="adj" id="h-dn">▼</button>
    </div>
    <div class="setter-colon">:</div>
    <div class="setter">
      <button class="adj" id="m-up">▲</button>
      <div class="alarm-digit" id="alarm-min">--</div>
      <button class="adj" id="m-dn">▼</button>
    </div>
  </div>

  <label class="toggle-row">
    <input type="checkbox" id="alarm-toggle">
    <span class="track"><span class="thumb"></span></span>
    <span class="tog-lbl">Enable Alarm</span>
  </label>

  <button class="dismiss-btn" id="dismiss">DISMISS ALARM</button>

  <div class="divider" style="margin-top:18px"></div>

  <!-- ── Device controls ── -->
  <div class="alarm-header">
    <span class="alarm-lbl">DEVICE</span>
  </div>
  <div class="device-row">
    <button class="device-btn reboot-btn" id="reboot">↺ REBOOT</button>
    <button class="device-btn safe-btn"   id="safe-mode">⛨ SAFE MODE</button>
  </div>

</div>
</ha-card>`;

// ── CSS ───────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');

  ha-card {
    background: #080808 !important;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
  }
  .card {
    padding: 20px 18px 18px;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    color: #ffcc00;
    box-sizing: border-box;
  }

  /* Title */
  .card-title {
    font-size: 10px;
    color: #333344;
    text-transform: uppercase;
    letter-spacing: 3px;
    text-align: center;
    margin-bottom: 18px;
  }

  /* ── Flip panels ── */
  .time-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .flip-panel {
    position: relative;
    width: 116px;
    height: 96px;
    background: #1a1a1e;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .upper {
    position: absolute;
    inset: 0 0 50% 0;
    background: #252528;
  }
  .fold {
    position: absolute;
    top: calc(50% - 1px);
    left: 0; right: 0;
    height: 2px;
    background: #060608;
    z-index: 2;
  }
  .digit {
    position: relative;
    z-index: 1;
    font-size: 58px;
    font-weight: 700;
    color: #ffcc00;
    line-height: 1;
    letter-spacing: -2px;
    user-select: none;
  }
  .time-colon {
    font-size: 52px;
    font-weight: 700;
    color: #ffcc00;
    margin-bottom: 10px;
    user-select: none;
  }

  /* Flip animation */
  @keyframes squishFlip {
    0%   { transform: scaleY(1);    opacity: 1;   }
    40%  { transform: scaleY(0.15); opacity: 0.3; }
    50%  { transform: scaleY(0);    opacity: 0;   }
    60%  { transform: scaleY(0.15); opacity: 0.3; }
    100% { transform: scaleY(1);    opacity: 1;   }
  }
  .flip-panel.flipping { animation: squishFlip 0.26s ease-in-out; }

  /* Seconds */
  .sec-row {
    text-align: center;
    margin-bottom: 16px;
  }
  #sec {
    font-size: 30px;
    font-weight: 600;
    color: #cc9900;
  }
  .sec-lbl {
    font-size: 10px;
    color: #333344;
    vertical-align: middle;
  }

  /* Divider */
  .divider {
    height: 1px;
    background: #1e1e2e;
    margin: 4px 0 16px;
  }

  /* Alarm header */
  .alarm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .alarm-lbl {
    font-size: 10px;
    color: #444455;
    letter-spacing: 3px;
    text-transform: uppercase;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 4px;
    letter-spacing: 1px;
    transition: all 0.3s;
  }
  .badge.armed { background: #112218; color: #44ff99; border: 1px solid #1e4430; }
  .badge.off   { background: #111118; color: #444455; border: 1px solid #222233; }
  .badge.sync  { background: #1e1a08; color: #ffcc00; border: 1px solid #5a4a18; }

  /* ── Alarm time setter ── */
  .setter-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }
  .setter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  .alarm-digit {
    width: 100px;
    height: 76px;
    background: #151518;
    border: 1px solid #2a2a35;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: 700;
    color: #ffcc00;
    letter-spacing: -2px;
    user-select: none;
    transition: background 0.15s;
  }
  .alarm-digit.pending {
    background: #1c1c22;
    border-color: #5a4a18;
    box-shadow: inset 0 0 0 1px rgba(255, 204, 0, 0.18);
  }
  .adj {
    width: 100px;
    height: 34px;
    background: #151520;
    border: 1px solid #2a2a40;
    color: #ffcc00;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s, transform 0.08s;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .adj:hover  { background: #1e1e32; }
  .adj:active { background: #2a2a48; transform: scale(0.97); }
  .setter-colon {
    font-size: 40px;
    color: #333344;
    font-weight: 700;
    padding-top: 6px;
    user-select: none;
  }

  /* ── Toggle ── */
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 2px;
    cursor: pointer;
    user-select: none;
    margin-bottom: 14px;
  }
  .toggle-row input { display: none; }
  .track {
    width: 46px;
    height: 26px;
    background: #1a1a28;
    border: 1px solid #2a2a40;
    border-radius: 13px;
    position: relative;
    flex-shrink: 0;
    transition: background 0.25s, border-color 0.25s;
  }
  .thumb {
    width: 20px;
    height: 20px;
    background: #444455;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.25s, background 0.25s;
  }
  #alarm-toggle:checked ~ .track,
  input:checked + .track {
    background: #112218;
    border-color: #44ff99;
  }
  input:checked + .track .thumb {
    transform: translateX(20px);
    background: #44ff99;
  }
  .tog-lbl {
    font-size: 13px;
    color: #777788;
  }

  /* ── Dismiss button ── */
  .dismiss-btn {
    width: 100%;
    padding: 13px;
    background: #140808;
    border: 1px solid #3a1010;
    color: #ff4422;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
    cursor: pointer;
    transition: background 0.15s, transform 0.08s;
    font-family: inherit;
  }
  .dismiss-btn:hover  { background: #200c0c; }
  .dismiss-btn:active { background: #2e1010; transform: scale(0.99); }

  /* ── Device controls ── */
  .device-row {
    display: flex;
    gap: 10px;
  }
  .device-btn {
    flex: 1;
    padding: 11px 6px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    cursor: pointer;
    transition: background 0.15s, transform 0.08s, color 0.15s;
    font-family: inherit;
  }
  .device-btn:active { transform: scale(0.97); }
  .device-btn.confirming { letter-spacing: 0.5px; }
  .reboot-btn {
    background: #0E0E20;
    border: 1px solid #2A2A50;
    color: #7777BB;
  }
  .reboot-btn:hover { background: #16162E; }
  .reboot-btn.confirming { background: #1A1A40; color: #AAAAEE; border-color: #4444AA; }
  .safe-btn {
    background: #0D1A0D;
    border: 1px solid #1E3A1E;
    color: #448844;
  }
  .safe-btn:hover { background: #122012; }
  .safe-btn.confirming { background: #0D2A0D; color: #66CC66; border-color: #2A6A2A; }
`;

customElements.define('zalarmclock-card', ZAlarmClockCard);

// Tell Home Assistant this card exists so it appears in the card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type:        'zalarmclock-card',
  name:        'ZAlarmClock Card',
  description: 'Flip clock alarm card for the ZAlarmClock ESPHome device.',
  preview:     false,
});
